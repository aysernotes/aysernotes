import { QuartzEmitterPlugin } from "../types"
import { QuartzComponentProps } from "../../components/types"
import HeaderConstructor from "../../components/Header"
import BodyConstructor from "../../components/Body"
import { pageResources, renderPage } from "../../components/renderPage"
import { ProcessedContent, QuartzPluginData } from "../vfile"
import { FullPageLayout } from "../../cfg"
import { pathToRoot } from "../../util/path"
import { defaultListPageLayout, sharedPageComponents } from "../../../quartz.layout"
import { BaseContent, BaseViewSelector } from "../../components"
import { write } from "./helpers"
import { BuildCtx } from "../../util/ctx"
import { StaticResources } from "../../util/resources"
import {
  renderBaseViewsForFile,
  RenderedBaseView,
  BaseViewMeta,
  BaseMetadata,
} from "../../util/base/render"
import { BaseFile } from "../../util/base/types"

interface BasePageOptions extends FullPageLayout {}

function isBaseFile(data: QuartzPluginData): boolean {
  return Boolean(data.basesConfig && (data.basesConfig as BaseFile).views?.length > 0)
}

function getBaseFiles(content: ProcessedContent[]): ProcessedContent[] {
  return content.filter(([_, file]) => isBaseFile(file.data))
}

async function processBasePage(
  ctx: BuildCtx,
  baseFileData: QuartzPluginData,
  renderedView: RenderedBaseView,
  allViews: BaseViewMeta[],
  allFiles: QuartzPluginData[],
  opts: FullPageLayout,
  resources: StaticResources,
) {
  const slug = renderedView.slug
  const cfg = ctx.cfg.configuration
  const externalResources = pageResources(pathToRoot(slug), resources)

  const viewFileData: QuartzPluginData = {
    ...baseFileData,
    slug,
    frontmatter: {
      ...baseFileData.frontmatter,
      title: renderedView.view.name,
    },
    basesRenderedTree: renderedView.tree,
    basesAllViews: allViews,
    basesCurrentView: renderedView.view.name,
    basesMetadata: {
      baseSlug: baseFileData.slug!,
      currentView: renderedView.view.name,
      allViews,
    },
  }

  const componentData: QuartzComponentProps = {
    ctx,
    fileData: viewFileData,
    externalResources,
    cfg,
    children: [],
    tree: renderedView.tree,
    allFiles,
  }

  const content = renderPage(cfg, slug, componentData, opts, externalResources)
  return write({
    ctx,
    content,
    slug,
    ext: ".html",
  })
}

export const BasePage: QuartzEmitterPlugin<Partial<BasePageOptions>> = (userOpts) => {
  const baseOpts: FullPageLayout = {
    ...sharedPageComponents,
    ...defaultListPageLayout,
    pageBody: BaseContent(),
    ...userOpts,
  }

  const opts: FullPageLayout = {
    ...baseOpts,
    beforeBody: [
      ...baseOpts.beforeBody.filter((component) => component.name !== "ArticleTitle"),
      BaseViewSelector(),
    ],
  }

  const { head: Head, header, beforeBody, pageBody, afterBody, left, right, footer: Footer } = opts
  const Header = HeaderConstructor()
  const Body = BodyConstructor()

  return {
    name: "BasePage",
    getQuartzComponents() {
      return [
        Head,
        Header,
        Body,
        ...header,
        ...beforeBody,
        pageBody,
        ...afterBody,
        ...left,
        ...right,
        Footer,
      ]
    },
    async *emit(ctx, content, resources) {
      const allFiles = content.map((c) => c[1].data)
      const baseFiles = getBaseFiles(content)

      for (const [_, file] of baseFiles) {
        const baseFileData = file.data
        const { views, allViews } = renderBaseViewsForFile(baseFileData, allFiles)

        for (const renderedView of views) {
          yield processBasePage(
            ctx,
            baseFileData,
            renderedView,
            allViews,
            allFiles,
            opts,
            resources,
          )
        }
      }
    },
    async *partialEmit(ctx, content, resources, changeEvents) {
      const allFiles = content.map((c) => c[1].data)
      const baseFiles = getBaseFiles(content)

      const affectedBaseSlugs = new Set<string>()

      for (const event of changeEvents) {
        if (!event.file) continue
        const slug = event.file.data.slug

        if (slug && isBaseFile(event.file.data)) {
          affectedBaseSlugs.add(slug)
        }
      }

      for (const [_, file] of baseFiles) {
        const baseFileData = file.data
        const baseSlug = baseFileData.slug

        if (!baseSlug || !affectedBaseSlugs.has(baseSlug)) continue

        const { views, allViews } = renderBaseViewsForFile(baseFileData, allFiles)

        for (const renderedView of views) {
          yield processBasePage(
            ctx,
            baseFileData,
            renderedView,
            allViews,
            allFiles,
            opts,
            resources,
          )
        }
      }
    },
  }
}

declare module "vfile" {
  interface DataMap {
    basesRenderedTree?: import("hast").Root
    basesAllViews?: BaseViewMeta[]
    basesCurrentView?: string
    basesMetadata?: BaseMetadata
  }
}
