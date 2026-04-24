#!/bin/bash
 
# Usage: yarn remove-worktree feat/31-my-feature
 
BRANCH=$1
WORKTREE_DIR="../wt-$(echo $BRANCH | sed 's/\//-/g')"
 
if [ -z "$BRANCH" ]; then
  echo "❌ Please provide a branch name"
  echo "Usage: yarn remove-worktree feat/my-feature"
  exit 1
fi
 
if [ ! -d "$WORKTREE_DIR" ]; then
  echo "❌ Worktree directory $WORKTREE_DIR does not exist"
  exit 1
fi
 
# Remove the worktree
git worktree remove "$WORKTREE_DIR"
 
# Delete the branch
git branch -d $BRANCH
 
echo "🗑️  Worktree $WORKTREE_DIR removed and branch $BRANCH deleted"
 