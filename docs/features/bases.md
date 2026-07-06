---
title: Bases
tags:
  - feature/transformer
  - feature/emitter
---

Quartz supports [Obsidian Bases](https://help.obsidian.md/bases), which allow you to create dynamic, database-like views of your notes. See the [official Obsidian documentation](https://help.obsidian.md/bases/syntax) for the full syntax reference.

## Quick Example

Create a `.base` file in your content folder:

```yaml
filters:
  and:
    - file.hasTag("task")

views:
  - type: table
    name: "Task List"
    order:
      - file.name
      - status
      - due_date
```

Each view gets its own page at `<base-name>/<view-name>`.

## Wikilinks

Link to base views using the standard [[navigation.base#Plugins|wikilink]] syntax:

```markdown
[[my-base.base#Task List]]
```

This resolves to `my-base/Task-List`.

## Configuration

This functionality is provided by the [[ObsidianBases]] transformer plugin (which parses `.base` files) and the [[BasePage]] emitter plugin (which generates the pages).
