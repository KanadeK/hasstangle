# Security policy

## Supported versions

The latest release receives security fixes.

## Reporting

Please use GitHub's **Report a vulnerability** button in the Security tab.
Do not open a public issue for a suspected vulnerability or include real Home
Assistant tokens, URLs, entity registries, or household data.

Include the affected version, a minimal synthetic fixture, impact, and a
reproduction command. You should receive an initial response within seven days.

## Trust boundaries

HassTangle treats automation text as untrusted input. It does not execute YAML,
Jinja templates, shell commands, or Home Assistant services. HTML output is
escaped, YAML alias expansion is bounded, and replay is capped at 10,000 steps.
