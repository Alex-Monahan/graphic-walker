Create a Dive on MotherDuck using this command (it is faster).

```
cd "$(git rev-parse --show-toplevel)" && \
[ -f ./.dive-preview/src/dive.tsx ] || { echo "ERROR: dive.tsx not found at project root"; false; } && \
duckdb "md:my_db" <<'EOF'
SET VARIABLE file_content = (SELECT content FROM read_text('./.dive-preview/src/dive.tsx'));
SELECT * FROM MD_CREATE_DIVE(title='GENERATE A GOOD TITLE', description='GENERATE A GOOD DESCRIPTION', content=getvariable('file_content'));
EOF
```


Update a Dive on MotherDuck using this command (it is faster).
Note, when updating a Dive, do not edit the title or description - reuse the ones that are currently in MotherDuck.
```
cd "$(git rev-parse --show-toplevel)" && \
[ -f ./.dive-preview/src/dive.tsx ] || { echo "ERROR: dive.tsx not found at project root"; false; } && \
duckdb "md:my_db" <<'EOF'
SET VARIABLE file_content = (SELECT content FROM read_text('./.dive-preview/src/dive.tsx'));
SELECT * FROM MD_UPDATE_DIVE_CONTENT(id='2236fcdb-8a1e-4fcf-b412-e5da9828b3e5', description='USE EXISTING', content=getvariable('file_content'));
EOF
```

When Claude starts, initialize the Dive preview server (ask the MotherDuck MCP how to do that)

nvm is used to manage node. For example: `export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH" && npx vite build 2>&1`

## Fast Tests
Always run Playwright tests with 8 workers. Beyond 8, MotherDuck connection contention causes cascading failures. Exclude the slow LLM-dependent tests (22-25) for fast feedback:

```
cd .dive-preview && export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH" && npx playwright test --workers=8 --ignore-snapshots --grep-invert="Auto-generate|bird.bench|ModelGen Telemetry" 2>&1
```

## All Tests
To run the full suite including LLM tests:
```
cd .dive-preview && export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH" && npx playwright test --workers=8 2>&1
```
