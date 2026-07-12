---
description: dev 커밋 → main --no-ff 병합 → push → SSH 운영배포 → dev 복귀 (운영 반영 전 GO 게이트)
argument-hint: "[커밋 메시지(선택)]"
allowed-tools: Bash(git:*), Bash(ssh:*), Bash(npx tsc:*), Bash(npm run:*)
---

당신은 LawQuery의 dev→운영 이관을 실행합니다. **속도를 위해 순서는 고정하되, 운영(prod)에 손대기 직전 반드시 사람의 GO를 받는 판단은 유지**하세요. 이것은 이 프로젝트의 절대 규칙입니다(메모리 `prod-deploy-confirm`: 운영 반영 전엔 항상 dev를 먼저 보여주고 GO 받은 뒤 배포).

배포 대상 (확정값):
- 운영 서버 SSH: `server` (192.168.0.7, 로컬망 — 같은 LAN에 있을 때만 도달)
- 원격 경로: `/var/www/lq`
- 원격 배포 스크립트: `./deploy.sh` (git pull origin main → npm install → tsc → webpack → sass → pm2 restart)
- git 원격: `origin` (git@github.com:kinphw/LawQuery.git)

인자 `$ARGUMENTS` 는 dev에 커밋할 메시지(선택). 없고 미커밋 변경이 있으면 변경 내용을 보고 적절한 한국어 커밋 메시지를 직접 작성하세요.

---

## 1단계 — 프리플라이트 (읽기 전용, 자동 진행)

다음을 확인하고 사용자에게 요약 보고:

1. 현재 브랜치가 `dev`인지 확인 (`git branch --show-current`). **dev가 아니면 중단**하고 사용자에게 알림.
2. `git status --short` 로 작업트리 상태 확인.
3. 미커밋 변경이 있으면 → 그 변경들을 스테이징(`git add -A`)하고 커밋. 메시지는 `$ARGUMENTS`가 있으면 그걸, 없으면 diff를 보고 작성. 커밋 메시지 끝에 다음 줄 추가:
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   ```
   변경이 없으면 이 단계 건너뜀.
4. **운영에 나갈 실제 내용 미리보기**: `git log --oneline origin/main..dev` (또는 `main..dev`)로 이번 배포에 포함될 커밋 목록을, `git diff --stat main..dev` 로 파일 요약을 보여줌.
5. (가능하면) 로컬 타입체크로 사전 검증: `npx tsc -p tsconfig.backend.json --noEmit`. 실패 시 배포 중단하고 오류 보고.

## 2단계 — ★ GO 게이트 (반드시 여기서 멈춤)

1단계 요약(이번에 운영으로 나갈 커밋 목록·파일 변경·타입체크 결과)을 제시하고, **"운영(codexa.kro.kr)에 배포할까요? GO 주시면 진행합니다"** 라고 명시적으로 물은 뒤 **사용자의 GO를 기다립니다.** GO 없이는 3단계로 넘어가지 마세요. 사용자가 원하면 여기서 멈추고 dev에만 남겨둘 수 있습니다(이미 커밋은 됨).

## 3단계 — 병합·푸시 (GO 이후에만)

```bash
git checkout main
git pull origin main          # 원격 최신 반영(충돌 시 중단·보고)
git merge --no-ff dev -m "merge: dev → main 배포"
git push origin main
```
- `--no-ff` 로 병합 커밋을 남김(히스토리에 배포 지점 표시).
- 병합 충돌이나 push 거부(non-fast-forward 등) 발생 시 **즉시 중단**하고 상태를 사용자에게 보고. 임의로 force-push 하지 마세요.

## 4단계 — SSH 운영 배포

```bash
ssh server 'cd /var/www/lq && ./deploy.sh'
```
- 출력(각 Step 로그, pm2 restart 결과)을 사용자에게 그대로 전달.
- `server`(192.168.0.7)는 로컬망 전용이므로 접속 실패 시 "같은 LAN에 있는지 / 외부라면 nest 호스트가 필요한지" 사용자에게 확인.
- deploy.sh 중간 실패 시 어느 Step에서 멎었는지 보고(운영 pm2는 이전 버전으로 계속 떠 있음).

## 5단계 — dev 복귀·마무리

```bash
git checkout dev
```
- 최종 보고: 배포된 커밋 수, main 병합 커밋 해시, 운영 pm2 재시작 성공 여부, 현재 브랜치(dev).
- 운영 반영이 됐으니 필요하면 실제 사이트(https://codexa.kro.kr) 기본 동작을 한 번 점검하도록 권유(선택).

---

**중단 규칙**: 어느 단계든 예상과 다르면(브랜치가 dev 아님, 타입체크 실패, 병합 충돌, push 거부, SSH 실패) 그 지점에서 멈추고 사실대로 보고하세요. 되돌리기 어려운 조작(force-push, 원격 히스토리 변경, 운영 DB 손대기)은 이 커맨드 범위 밖입니다.
