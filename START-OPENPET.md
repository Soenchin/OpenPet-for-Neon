# OpenPet 本地部署（本工作区）

## 已经准备好的东西

1. **源码**：`OpenPet/`（从 GitHub 克隆，v0.1.6）
2. **Windows 安装包**：`outputs/openpet/OpenPet_0.1.6_x64-setup.exe`（约 6.1 MB）
3. **Neon 宠物包**（`pet.json` + `spritesheet.webp`）已放到：
   - `OpenPet/public/pets/neon/`（源码内，给以后自己编译用）
   - `~/.codex/pets/neon/`（OpenPet **默认**会扫这个目录）
   - 多个 AppData 候选路径下的 `pets/neon/`（兜底）

## 推荐用法（先装 Release，最快）

本机当前没有完整 Rust/pnpm 工具链时，**别硬编译**，直接装安装包。

1. 双击运行：

   `outputs/openpet/OpenPet_0.1.6_x64-setup.exe`

   或双击：

   `OpenPet/install-openpet.bat`

2. 启动 OpenPet 后：
   - 桌宠右键 / 托盘 → 打开 **Settings**
   - **Pet** 页里选 **Neon**
   - 若列表没有 Neon：确认存储预设是 **`.codex pets`**（默认就是），然后点刷新/重启 OpenPet

3. 本地控制 API 默认：

   `http://127.0.0.1:17321`

   常用：

   ```bash
   curl http://127.0.0.1:17321/api/status
   curl -X POST http://127.0.0.1:17321/api/event ^
     -H "Content-Type: application/json" ^
     -d "{\"type\":\"thinking\",\"message\":\"Working...\",\"ttlMs\":4000}"
   ```

## 本地导入（可选）

OpenPet 启动后也可用 API 强制导入：

```bash
curl -X POST http://127.0.0.1:17321/api/import/local ^
  -H "Content-Type: application/json" ^
  -d "{\"source\":\"X:\\\\CC\\\\projects\\\\pets\\\\outputs\\\\neon-codex-pet\",\"force\":true}"
```

## 从源码跑（以后有 Rust + pnpm 再搞）

```bash
cd OpenPet
pnpm install
pnpm tauri:dev
```

依赖：Node 18+、pnpm、Rust stable、Tauri 环境。

## 备注

- OpenPet 内置宠只有 **Nia**（写死在代码里）；Neon 是作为 **imported pet** 走 `~/.codex/pets` 或 AppData `pets/`。
- 默认存储预设就是 `CodexCustom` → `~/.codex/pets`，所以你现在这包装完就能看见的概率最高。

## WorkBuddy 接入

已配置：

- Hook 脚本：`OpenPet/hooks/workbuddy-openpet-hook.cjs`
- WorkBuddy 配置：`~/.workbuddy/settings.json`（hooks 指向上述脚本）
- 备份：`~/.workbuddy/settings.json.bak-openpet-*`

事件映射：

| WorkBuddy | OpenPet event |
|---|---|
| UserPromptSubmit | thinking |
| PreToolUse / PostToolUse | tool-running |
| Stop（真实完成） | success |
| Notification（非 idle_prompt） | attention |
| SessionStart | attention |
| SessionEnd | success |
| PreCompact | reviewing |

**改 hooks 后请重启 WorkBuddy 客户端。**  
OpenPet 需保持运行（默认 `http://127.0.0.1:17321`）。

本地自测：

```bash
node "X:/CC/projects/pets/OpenPet/hooks/workbuddy-openpet-hook.cjs" UserPromptSubmit
node "X:/CC/projects/pets/OpenPet/hooks/workbuddy-openpet-hook.cjs" PreToolUse
node "X:/CC/projects/pets/OpenPet/hooks/workbuddy-openpet-hook.cjs" Stop
curl http://127.0.0.1:17321/api/status
```
