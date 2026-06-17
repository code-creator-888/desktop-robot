# 快速启动指南

## 第一次设置

安装后，使用以下命令链接启动脚本：

```bash
cd /Users/liuhw8/software/desktop-robot
npm link
```

这会在你的系统中注册 `robot-start` 命令。

## 启动机器人

现在你可以从任何地方使用简单的命令启动机器人：

```bash
robot-start
```

机器人会在后台启动，你可以立即关闭终端窗口。

## 其他选项

```bash
# 查看帮助
robot-start --help

# 或使用原始 npm 命令
npm start          # 从项目目录
cd /Users/liuhw8/software/desktop-robot && npm start
```

## 故障排除

如果 `robot-start` 命令找不到：

```bash
# 重新链接
npm link

# 或手动添加到 PATH
export PATH="/Users/liuhw8/software/desktop-robot:$PATH"
```

## 后台运行

`robot-start` 已经配置为后台运行（detached 模式），所以：
- 启动后可以立即关闭终端
- 机器人会保持运行
- 通过系统菜单关闭机器人窗口可以退出应用
