#!/bin/bash
 
# Usage: yarn new-worktree feat/31-my-feature
 
BRANCH=$1
MAIN_REPO=$(pwd)
WORKTREE_DIR="../wt-$(echo $BRANCH | sed 's/\//-/g')"
 
if [ -z "$BRANCH" ]; then
  echo "❌ Please provide a branch name"
  echo "Usage: yarn new-worktree feat/my-feature"
  exit 1
fi
 
# Create the worktree and branch
git worktree add -b $BRANCH $WORKTREE_DIR main
 
# Copy .vscode if present
if [ -d "$MAIN_REPO/.vscode" ]; then
  cp -r "$MAIN_REPO/.vscode" "$WORKTREE_DIR/.vscode"
else
  echo "ℹ️  No .vscode directory found in main repo, skipping copy."
fi
 
# Copy all .env files
for env_file in "$MAIN_REPO"/.env*; do
  [ -f "$env_file" ] && cp "$env_file" "$WORKTREE_DIR/$(basename $env_file)"
done
 
# Copy node_modules via hard links (fast, minimal disk usage)
# Fall back to yarn install if node_modules doesn't exist in main repo
if [ -d "$MAIN_REPO/node_modules" ]; then
  echo "📦 Hard-linking node_modules..."
  cp -rl "$MAIN_REPO/node_modules" "$WORKTREE_DIR/node_modules"
else
  echo "📦 node_modules not found in main repo, running yarn install..."
  cd $WORKTREE_DIR && yarn install
fi
 
# Open in VSCode
if command -v code &> /dev/null; then
  code $WORKTREE_DIR
else
  echo "⚠️  VS Code CLI not found. Open the worktree manually: $WORKTREE_DIR"
fi
 
echo "✅ Worktree ready at $WORKTREE_DIR on branch $BRANCH"
 