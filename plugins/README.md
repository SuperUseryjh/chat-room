# 聊天室插件系统

本文档详细介绍了如何为聊天室开发和管理插件。

## 插件目录

所有插件文件都应放置在项目根目录下的 `plugins/` 目录中。

## 插件结构

每个插件都是一个独立的 JavaScript 文件（例如 `my-plugin.js`），它必须导出一个包含以下属性和方法的对象：

```javascript
module.exports = {
  name: 'My Awesome Plugin', // 插件名称 (必填)
  description: '这是一个示例插件，用于演示如何与聊天室交互。', // 插件描述 (可选)
  version: '1.0.0', // 插件版本 (可选)
  enabled: true, // 插件是否默认启用 (可选，默认为 true)

  // 生命周期钩子
  onLoad: function(api) {
    // 插件加载时调用
    console.log(`${this.name} 已加载！`);
    // 注册事件监听器，例如：
    // api.on('chatMessage', this.onChatMessage);
  },

  onUnload: function() {
    // 插件卸载时调用
    console.log(`${this.name} 已卸载！`);
  },

  // 聊天消息事件处理函数
  onChatMessage: function(messageData, api) {
    // 当有新的聊天消息时调用
    // messageData 包含 { username, message, file_url, quoted_message, mentions, timestamp }
    // api 提供与聊天室核心功能交互的接口
    console.log(`[${this.name}] 收到消息: ${messageData.message}`);

    // 示例：如果消息包含特定关键词，则回复
    if (messageData.message.toLowerCase().includes('hello plugin')) {
      api.sendMessage('Hello there! This is your plugin speaking.', 'PluginBot');
    }

    // 返回 true 表示消息已被处理，阻止后续插件或默认处理
    // 返回 false 或不返回任何值表示消息继续传递给后续插件或默认处理
    return false;
  },

  // 其他自定义函数...
  myCustomFunction: function() {
    console.log('这是一个自定义函数。');
  }
};
```

## 插件 API

`onLoad` 和 `onChatMessage` 等钩子函数会接收一个 `api` 对象，该对象提供以下方法与聊天室核心功能进行交互：

*   `api.sendMessage(message, username = 'System', fileUrl = null, quotedMessage = null, mentions = [])`:
    向聊天室发送一条消息。`username` 默认为 'System'。

*   `api.getOnlineUsers()`:
    获取当前所有在线用户的用户名数组。

*   `api.getAdminUsers()`:
    获取所有管理员用户的用户名数组。

*   `api.muteUser(username)`:
    禁言指定用户。

*   `api.unmuteUser(username)`:
    解禁指定用户。

*   `api.isUserMuted(username)`:
    检查用户是否被禁言。

*   `api.on(eventName, listener)`:
    注册一个事件监听器。目前支持的事件有：
    *   `chatMessage`: 当有新的聊天消息时触发。

*   `api.off(eventName, listener)`:
    移除一个事件监听器。

## 插件管理 (管理员面板)

管理员可以通过聊天室的管理员面板来管理插件：

*   **启用/禁用插件：** 管理员可以切换插件的启用状态。禁用的插件将不会被加载。
*   **查看插件状态：** 查看已加载插件的名称、描述和版本。

## 示例插件

以下是一个简单的“回声”插件示例 (`plugins/echo-plugin.js`)：

```javascript
module.exports = {
  name: 'Echo Plugin',
  description: '当收到消息时，回复相同的内容。',
  version: '1.0.0',

  onLoad: function(api) {
    console.log(`${this.name} 已加载！`);
    api.on('chatMessage', this.onChatMessage);
  },

  onChatMessage: function(messageData, api) {
    if (messageData.username !== 'Echo Plugin') { // 避免无限循环
      api.sendMessage(`Echo: ${messageData.message}`, this.name);
    }
    return false;
  }
};
```

## 注意事项

*   插件代码将在服务器端运行，请确保其安全性。
*   插件中的错误可能会影响服务器的稳定性。
*   避免在插件中执行耗时操作，以免阻塞主线程。
*   插件的 `name` 属性应是唯一的。
