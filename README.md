# Codex Usage Companion

Windows x64 的 Codex 个人额度悬浮监控工具。运行 Portable EXE 后会显示控制中心；Codex 位于前台时，标题栏顶部显示连续使用天数、剩余额度和个人重置倒计时。

## 当前功能

- 通过随软件携带的 Codex App Server 读取当前 ChatGPT 账户的个人额度窗口、重置时间、重置卡和最近 7 天 Token 趋势。
- 个人额度启动后立即读取，此后每 1 分钟自动刷新一次；额度恢复时间到达时也会额外刷新。
- 鼠标悬停顶部额度胶囊可展开详情；不会抢焦点或阻塞 Codex 标题栏拖动。
- 详情页提供“额度重置雷达”：读取 Codex Resets 的公开重置公告与第三方观察信号；控制中心可查看最近 20 条公开记录并打开原帖。该数据不是 OpenAI 官方承诺，不会改变或替代个人额度读取。
- 控制中心提供概览、工具和设置；关闭窗口后继续驻留系统托盘。
- 支持立即刷新、开机启动、开机时静默进入托盘和脱敏诊断导出。

软件不抓取 X 帖子、不使用 DeepSeek/OpenAI/X API Key、不预测全员额度重置。个人额度功能不受影响。

## 使用

1. 运行 `Codex-Usage-Companion-1.1.1-portable.exe`。
2. 在 Codex 桌面端登录自己的 ChatGPT 账户。
3. 将 Codex 切到前台，稍候即可看到标题栏中的个人额度胶囊。

## 开发与测试

要求 Windows x64、Node.js 22+ 和 pnpm。

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm test:integration
pnpm dev
```

本机需要已经通过 Codex 登录 ChatGPT。应用不读取或保存 OAuth Token；认证和刷新由 `codex app-server` 处理。

## 构建 Portable EXE

```powershell
pnpm package:portable
```

唯一交付目录是 `release/`，其中只保留最新的 Portable EXE。打包过程临时使用 `.portable-staging/`，成功后自动清理中间产物并覆盖 `release/`。最终 EXE 内含 Windows x64 Codex Runtime，不依赖用户安装 Node.js 或 .NET SDK。

## 本地数据与隐私

- 普通设置和派生后的个人额度快照保存在当前 Windows 用户的数据目录。
- 软件不会请求、保存或上传任何模型 API Key、X Token 或 OAuth Token。
- 导出诊断只包含运行状态、个人额度和错误码，不包含账户 ID、会话正文或原始服务端响应。
- 软件没有自建服务器、遥测或云端中继。

本项目是非官方个人工具，与 OpenAI 或 X 无隶属或背书关系。第三方许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。


## 赞助支持

如果这个工具对你有帮助，欢迎赞助！
微信扫码赞助：

<p align="center">
  <img src="assets/wechat-sponsor-qr.png" alt="微信赞助二维码" width="260">
</p>
