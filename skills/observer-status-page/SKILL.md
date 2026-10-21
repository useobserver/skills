---
name: observer-status-page
description: Changes how an Observer status page looks and what it shows. Reads pages with listPages and getPage, changes settings with updatePage (title, layout, time zone, language, subscriptions, auto-refresh, branding, footer links, metric group order and summary rows, search engine settings, theme preset), arranges which metrics show in which group and order through a config document, and makes a protected page public only after explicit confirmation. Explains what stays in the console (password, IP allow-list, JWT, customer-scoped and SSO access, custom CSS, custom domains). Use when the user says "what's our status page URL", "rename the status page", "switch the page to German", "group the metrics by region", "hide the Powered by Observer link", "use the midnight theme", "stop search engines indexing the page", or "make the page public". For adding new checks use observer-checks; for the whole config file in git use observer-config-as-code.
license: ISC
---

# Status pages

A status page shows chosen metrics, grouped and ordered, with its own look and
access mode. Settings change with `updatePage` or a page entry in a config
document; which metrics show, and how they are grouped, changes only through a
config document.

Needs: `read:config`; changes need `write:config`.

## Read first

1. `listPages`: every page with `subdomain`, `title`, `public_url` (the active
   custom domain, else `https://<subdomain>.use.observer`), `access_mode` and
   custom domain state.
2. `getPage` for the one to change: its settings and its metrics in display
   order.

To give someone the address, use `public_url`.

## Change settings

1. Collect only the fields that change. `updatePage` changes the fields you
   send; the rest keep their value.

   | Field | Values |
   |---|---|
   | `title` | 2 to 120 characters |
   | `layout` | `minimal`, `aurora`, `blueprint` |
   | `timezone` | IANA name, for example `Europe/London` (default UTC) |
   | `locale` | `en`, `es`, `fr`, `de`, `pt-BR`, `it`, `nl`, `ja`, `ar`, `zh-CN` |
   | `allow_subscriptions`, `show_auto_refresh` | true or false |
   | `hide_branding` | true needs a paid plan |
   | `footer_links` | up to 5 `{ label, href }`; replaces the whole list |
   | `metric_group_order` | group names in order, `null` for ungrouped; `null` resets |
   | `metric_group_summary` | show each group as one summary row |
   | `seo_description`, `seo_noindex` | search engine text; ask engines not to index |
   | `theme` | `{ "preset": "<slug>" }`, replaces colours, fonts and spacing |
   | `access_mode` | only `public` (see below) |

2. Show the user the before and after values. Page changes are visible to
   visitors at once.
3. Call `updatePage`. The response is the page plus `changed`, the settings
   that changed.
4. Verify: compare `changed` with what you meant to change, and `getPage`
   if anything looks off.

If a config document names that setting for the page, update the document
too, or its next apply sets the old value again.

## Make a page public

`access_mode: public` removes the page's password, allow-list, JWT, customer
scoping or SSO, and anyone can open it. Do this only when the user asks for
it in this conversation: name the current mode, say that its protection will
be removed, and get an explicit yes. Restating `public` on a public page
changes nothing. The other access modes carry credentials and are set only in
the console.

## Arrange metrics and groups

Which metrics a page shows, their group and their order live in the page's
`metrics` list in a config document:

```yaml
pages:
  - key: status
    subdomain: acme-status
    metrics:
      - { metric: api-health, group: API, order: 1 }
      - { metric: api-latency-3f9a1c, group: API, order: 2 }
      - { metric: db-connections, group: Data }
    metric_group_order: [API, Data]
    metric_group_summary: true
```

1. `exportConfig` with `all: true`, take the page entry as it is.
2. Edit `metrics`; references can name existing metrics by key.
3. `applyConfig` with `dryRun: true`. The page's diff lists metrics `added`,
   `removed` and `changed` and the `settings` that change. Show it.
4. Apply after approval, then `getPage` to confirm the order.

Per-metric console settings (public label, uptime bar) are kept by apply.

## Console only

Password, IP allow-list, JWT, customer-scoped and SSO access; custom CSS;
custom domains (and removing one before deleting a page). Point the user to
the console for these.

## Deleting a page

`deletePage` (config-managed pages only) is permanent and unpublishes the
address. Confirm by name and subdomain first. 409 `in_use` lists active
subscribers (`cascade: true` only with consent); 409
`custom_domain_attached` means remove the domain in the console first. Then
remove the page from the config document.

## Example requests

- "What's the link to our status page?"
- "Change the status page to Japanese and Tokyo time."
- "Group the checks into API, Website and Data, in that order."
- "Remove the password, the page can be public now."
- "Hide the page from Google while we're testing."

Guides: https://docs.use.observer/docs/guides/theme-customization and
https://docs.use.observer/docs/guides/search-engine-settings
