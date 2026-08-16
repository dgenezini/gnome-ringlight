SHELL := /bin/bash

.PHONY: all check test test-headless schemas

all: check test

# Syntax check
check:
	node --check extension.js
	node --check prefs.js

# Unit + schema tests
test:
	node --test tests/extension.test.mjs

# Headless GNOME Shell integration suite
test-headless:
	node tests/headless/run.mjs

# Recompile schema binary (commit the result)
schemas:
	glib-compile-schemas schemas/
