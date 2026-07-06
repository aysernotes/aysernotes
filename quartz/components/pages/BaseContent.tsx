import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"
import style from "../styles/basePage.scss"
import { htmlToJsx } from "../../util/jsx"

export default (() => {
  const BaseContent: QuartzComponent = (props: QuartzComponentProps) => {
    const { fileData, tree } = props

    return (
      <div class="popover-hint">
        <article class={["base-content", ...(fileData.frontmatter?.cssclasses ?? [])].join(" ")}>
          {htmlToJsx(fileData.filePath!, fileData.basesRenderedTree ?? tree)}
        </article>
      </div>
    )
  }

  BaseContent.css = style
  return BaseContent
}) satisfies QuartzComponentConstructor
