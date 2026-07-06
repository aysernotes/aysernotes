import * as yaml from "js-yaml"
import { QuartzTransformerPlugin } from "../types"
import { FilePath, getFileExtension } from "../../util/path"
import {
  BaseFile,
  BaseView,
  BaseFileFilter,
  parseViews,
  parseViewSummaries,
  BUILTIN_SUMMARY_TYPES,
  BuiltinSummaryType,
} from "../../util/base/types"
import {
  parseExpressionSource,
  compileExpression,
  buildPropertyExpressionSource,
  ProgramIR,
  BasesExpressions,
  BaseExpressionDiagnostic,
  Span,
} from "../../util/base/compiler"

export interface BasesOptions {
  /** Whether to emit diagnostics as warnings during build */
  emitWarnings: boolean
}

const defaultOptions: BasesOptions = {
  emitWarnings: true,
}

type FilterStructure =
  | string
  | { and?: FilterStructure[]; or?: FilterStructure[]; not?: FilterStructure[] }

function compileFilterStructure(
  filter: FilterStructure | undefined,
  file: string,
  diagnostics: BaseExpressionDiagnostic[],
  context: string,
): ProgramIR | undefined {
  if (!filter) return undefined

  if (typeof filter === "string") {
    const result = parseExpressionSource(filter, file)
    if (result.diagnostics.length > 0) {
      for (const diag of result.diagnostics) {
        diagnostics.push({
          kind: diag.kind as "lex" | "parse" | "runtime",
          message: diag.message,
          span: diag.span,
          context,
          source: filter,
        })
      }
    }
    if (!result.program.body) return undefined
    return compileExpression(result.program.body)
  }

  const compileParts = (
    parts: FilterStructure[],
    combiner: "&&" | "||",
    negate: boolean,
  ): ProgramIR | undefined => {
    const compiled: ProgramIR[] = []
    for (const part of parts) {
      const partIR = compileFilterStructure(part, file, diagnostics, context)
      if (partIR) compiled.push(partIR)
    }
    if (compiled.length === 0) return undefined
    if (compiled.length === 1) {
      if (negate) {
        return wrapWithNot(compiled[0])
      }
      return compiled[0]
    }

    let result = compiled[0]
    for (let i = 1; i < compiled.length; i++) {
      result = combineWithLogical(result, compiled[i], combiner, negate)
    }
    return result
  }

  if (filter.and && filter.and.length > 0) {
    return compileParts(filter.and, "&&", false)
  }
  if (filter.or && filter.or.length > 0) {
    return compileParts(filter.or, "||", false)
  }
  if (filter.not && filter.not.length > 0) {
    return compileParts(filter.not, "&&", true)
  }

  return undefined
}

function wrapWithNot(ir: ProgramIR): ProgramIR {
  const span = ir.span
  return {
    instructions: [
      ...ir.instructions,
      { op: "to_bool" as const, span },
      { op: "unary" as const, operator: "!" as const, span },
    ],
    span,
  }
}

function combineWithLogical(
  left: ProgramIR,
  right: ProgramIR,
  operator: "&&" | "||",
  negateRight: boolean,
): ProgramIR {
  const span: Span = {
    start: left.span.start,
    end: right.span.end,
    file: left.span.file,
  }

  const rightIR = negateRight ? wrapWithNot(right) : right

  if (operator === "&&") {
    const jumpIfFalseIndex = left.instructions.length + 1
    const jumpIndex = jumpIfFalseIndex + rightIR.instructions.length + 2
    return {
      instructions: [
        ...left.instructions,
        { op: "jump_if_false" as const, target: jumpIndex, span },
        ...rightIR.instructions,
        { op: "to_bool" as const, span },
        { op: "jump" as const, target: jumpIndex + 1, span },
        {
          op: "const" as const,
          literal: { type: "Literal" as const, kind: "boolean" as const, value: false, span },
          span,
        },
      ],
      span,
    }
  } else {
    const jumpIfTrueIndex = left.instructions.length + 1
    const jumpIndex = jumpIfTrueIndex + rightIR.instructions.length + 2
    return {
      instructions: [
        ...left.instructions,
        { op: "jump_if_true" as const, target: jumpIndex, span },
        ...rightIR.instructions,
        { op: "to_bool" as const, span },
        { op: "jump" as const, target: jumpIndex + 1, span },
        {
          op: "const" as const,
          literal: { type: "Literal" as const, kind: "boolean" as const, value: true, span },
          span,
        },
      ],
      span,
    }
  }
}

function collectPropertiesFromViews(views: BaseView[]): Set<string> {
  const properties = new Set<string>()
  for (const view of views) {
    if (view.order) {
      for (const prop of view.order) {
        properties.add(prop)
      }
    }
    if (view.groupBy) {
      const groupProp = typeof view.groupBy === "string" ? view.groupBy : view.groupBy.property
      properties.add(groupProp)
    }
    if (view.sort) {
      for (const sortConfig of view.sort) {
        properties.add(sortConfig.property)
      }
    }
    if (view.image) properties.add(view.image)
    if (view.date) properties.add(view.date)
    if (view.dateField) properties.add(view.dateField)
    if (view.dateProperty) properties.add(view.dateProperty)
    if (view.coordinates) properties.add(view.coordinates)
    if (view.markerIcon) properties.add(view.markerIcon)
    if (view.markerColor) properties.add(view.markerColor)
  }
  return properties
}

function compilePropertyExpressions(
  properties: Set<string>,
  file: string,
  diagnostics: BaseExpressionDiagnostic[],
): Record<string, ProgramIR> {
  const expressions: Record<string, ProgramIR> = {}

  for (const property of properties) {
    const source = buildPropertyExpressionSource(property)
    if (!source) continue

    const result = parseExpressionSource(source, file)
    if (result.diagnostics.length > 0) {
      for (const diag of result.diagnostics) {
        diagnostics.push({
          kind: diag.kind as "lex" | "parse" | "runtime",
          message: diag.message,
          span: diag.span,
          context: `property.${property}`,
          source,
        })
      }
    }
    if (result.program.body) {
      expressions[property] = compileExpression(result.program.body)
    }
  }

  return expressions
}

function compileFormulas(
  formulas: Record<string, string> | undefined,
  file: string,
  diagnostics: BaseExpressionDiagnostic[],
): Record<string, ProgramIR> {
  if (!formulas) return {}

  const compiled: Record<string, ProgramIR> = {}
  for (const [name, source] of Object.entries(formulas)) {
    const trimmed = source.trim()
    if (!trimmed) continue

    const result = parseExpressionSource(trimmed, file)
    if (result.diagnostics.length > 0) {
      for (const diag of result.diagnostics) {
        diagnostics.push({
          kind: diag.kind as "lex" | "parse" | "runtime",
          message: diag.message,
          span: diag.span,
          context: `formulas.${name}`,
          source: trimmed,
        })
      }
    }
    if (result.program.body) {
      compiled[name] = compileExpression(result.program.body)
    }
  }

  return compiled
}

function compileSummaries(
  summaries: Record<string, string> | undefined,
  file: string,
  diagnostics: BaseExpressionDiagnostic[],
): Record<string, ProgramIR> {
  if (!summaries) return {}

  const compiled: Record<string, ProgramIR> = {}
  for (const [name, source] of Object.entries(summaries)) {
    const trimmed = source.trim()
    if (!trimmed) continue

    const normalized = trimmed.toLowerCase()
    if (BUILTIN_SUMMARY_TYPES.includes(normalized as BuiltinSummaryType)) {
      continue
    }

    const result = parseExpressionSource(trimmed, file)
    if (result.diagnostics.length > 0) {
      for (const diag of result.diagnostics) {
        diagnostics.push({
          kind: diag.kind as "lex" | "parse" | "runtime",
          message: diag.message,
          span: diag.span,
          context: `summaries.${name}`,
          source: trimmed,
        })
      }
    }
    if (result.program.body) {
      compiled[name] = compileExpression(result.program.body)
    }
  }

  return compiled
}

function compileViewSummaries(
  views: BaseView[],
  topLevelSummaries: Record<string, string> | undefined,
  file: string,
  diagnostics: BaseExpressionDiagnostic[],
): Record<string, Record<string, ProgramIR>> {
  const result: Record<string, Record<string, ProgramIR>> = {}

  for (let i = 0; i < views.length; i++) {
    const view = views[i]
    if (!view.summaries) continue

    const viewSummaryConfig = parseViewSummaries(
      view.summaries as Record<string, string>,
      topLevelSummaries,
    )
    if (!viewSummaryConfig?.columns) continue

    const viewExpressions: Record<string, ProgramIR> = {}
    for (const [column, def] of Object.entries(viewSummaryConfig.columns)) {
      if (def.type !== "formula" || !def.expression) continue

      const parseResult = parseExpressionSource(def.expression, file)
      if (parseResult.diagnostics.length > 0) {
        for (const diag of parseResult.diagnostics) {
          diagnostics.push({
            kind: diag.kind as "lex" | "parse" | "runtime",
            message: diag.message,
            span: diag.span,
            context: `views[${i}].summaries.${column}`,
            source: def.expression,
          })
        }
      }
      if (parseResult.program.body) {
        viewExpressions[column] = compileExpression(parseResult.program.body)
      }
    }

    if (Object.keys(viewExpressions).length > 0) {
      result[String(i)] = viewExpressions
    }
  }

  return result
}

export const ObsidianBases: QuartzTransformerPlugin<Partial<BasesOptions>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }

  return {
    name: "ObsidianBases",
    textTransform(_ctx, src) {
      return src
    },
    markdownPlugins(_ctx) {
      return [
        () => {
          return (_tree, file) => {
            const filePath = file.data.filePath as FilePath | undefined
            if (!filePath) return

            const ext = getFileExtension(filePath)
            if (ext !== ".base") return

            const content = file.value.toString()
            if (!content.trim()) return

            const diagnostics: BaseExpressionDiagnostic[] = []
            const filePathStr = filePath

            try {
              const parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA }) as Record<
                string,
                unknown
              >
              if (!parsed || typeof parsed !== "object") {
                diagnostics.push({
                  kind: "parse",
                  message: "Base file must contain a valid YAML object",
                  span: {
                    start: { offset: 0, line: 1, column: 1 },
                    end: { offset: 0, line: 1, column: 1 },
                    file: filePathStr,
                  },
                  context: "root",
                  source: content.slice(0, 100),
                })
                file.data.basesDiagnostics = diagnostics
                return
              }

              const rawViews = parsed.views
              if (!Array.isArray(rawViews) || rawViews.length === 0) {
                diagnostics.push({
                  kind: "parse",
                  message: "Base file must have at least one view defined",
                  span: {
                    start: { offset: 0, line: 1, column: 1 },
                    end: { offset: 0, line: 1, column: 1 },
                    file: filePathStr,
                  },
                  context: "views",
                  source: "views: []",
                })
                file.data.basesDiagnostics = diagnostics
                return
              }

              const views = parseViews(rawViews)
              const filters = parsed.filters as BaseFileFilter | undefined
              const properties = parsed.properties as
                | Record<string, { displayName?: string }>
                | undefined
              const summaries = parsed.summaries as Record<string, string> | undefined
              const formulas = parsed.formulas as Record<string, string> | undefined

              const baseConfig: BaseFile = {
                filters,
                views,
                properties,
                summaries,
                formulas,
              }

              const compiledFilters = compileFilterStructure(
                filters as FilterStructure | undefined,
                filePathStr,
                diagnostics,
                "filters",
              )

              const viewFilters: Record<string, ProgramIR> = {}
              for (let i = 0; i < views.length; i++) {
                const view = views[i]
                if (view.filters) {
                  const compiled = compileFilterStructure(
                    view.filters as FilterStructure,
                    filePathStr,
                    diagnostics,
                    `views[${i}].filters`,
                  )
                  if (compiled) {
                    viewFilters[String(i)] = compiled
                  }
                }
              }

              const compiledFormulas = compileFormulas(formulas, filePathStr, diagnostics)

              const compiledSummaries = compileSummaries(summaries, filePathStr, diagnostics)
              const compiledViewSummaries = compileViewSummaries(
                views,
                summaries,
                filePathStr,
                diagnostics,
              )

              const viewProperties = collectPropertiesFromViews(views)

              for (const name of Object.keys(compiledFormulas)) {
                viewProperties.add(`formula.${name}`)
              }

              const propertyExpressions = compilePropertyExpressions(
                viewProperties,
                filePathStr,
                diagnostics,
              )

              const expressions: BasesExpressions = {
                filters: compiledFilters,
                viewFilters,
                formulas: compiledFormulas,
                summaries: compiledSummaries,
                viewSummaries: compiledViewSummaries,
                propertyExpressions,
              }

              file.data.basesConfig = baseConfig
              file.data.basesExpressions = expressions
              file.data.basesDiagnostics = diagnostics

              const existingFrontmatter = (file.data.frontmatter ?? {}) as Record<string, unknown>
              file.data.frontmatter = {
                title: views[0]?.name ?? file.stem ?? "Base",
                tags: ["base"],
                ...existingFrontmatter,
              }

              if (opts.emitWarnings && diagnostics.length > 0) {
                for (const diag of diagnostics) {
                  console.warn(
                    `[bases] ${filePathStr}:${diag.span.start.line}:${diag.span.start.column} - ${diag.message}`,
                  )
                }
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              diagnostics.push({
                kind: "parse",
                message: `Failed to parse base file: ${message}`,
                span: {
                  start: { offset: 0, line: 1, column: 1 },
                  end: { offset: 0, line: 1, column: 1 },
                  file: filePathStr,
                },
                context: "root",
                source: content.slice(0, 100),
              })
              file.data.basesDiagnostics = diagnostics

              if (opts.emitWarnings) {
                console.warn(`[bases] ${filePathStr}: ${message}`)
              }
            }
          }
        },
      ]
    },
  }
}

declare module "vfile" {
  interface DataMap {
    basesConfig?: BaseFile
    basesExpressions?: BasesExpressions
    basesDiagnostics?: BaseExpressionDiagnostic[]
  }
}
