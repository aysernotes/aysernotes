---
title: BasePage
tags:
  - plugin/emitter
---

This plugin emits pages for each view defined in `.base` files. See [[bases]] for usage.

> [!note]
> For information on how to add, remove or configure plugins, see the [[configuration#Plugins|Configuration]] page.

Pages use `defaultListPageLayout` from `quartz.layout.ts` with `BaseContent` as the page body. To customize the layout, edit `quartz/components/pages/BaseContent.tsx`.

## API

- Category: Emitter
- Function name: `Plugin.BasePage()`.
- Source: [`quartz/plugins/emitters/basePage.tsx`](https://github.com/jackyzha0/quartz/blob/v4/quartz/plugins/emitters/basePage.tsx).
