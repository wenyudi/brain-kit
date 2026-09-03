#!/usr/bin/env bash
# 每日 git 快照（#9 拍板；2026-08-11 提交逻辑收敛进 snap.js 单内核）：
# 守卫/顶层哨兵/心跳戳在 brain-tools/snap.js（Stop hook 的每轮 checkpoint 也用它）；这里只负责每日模式 + 推送。
set -euo pipefail
cd "${BRAIN_ROOT:?snapshot.sh 需要 BRAIN_ROOT}"
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
node "$(dirname "$0")/snap.js" daily
if [ -n "$(git log --oneline '@{u}..HEAD' 2>/dev/null)" ]; then
  git push -q origin master || echo "push 失败（离线？）——快照已本地提交"
fi
