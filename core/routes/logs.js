const express = require('express');
// 引入我们在 logger.js 中暴露的缓存和事件发射器

const { logCache, logEmitter } = require('../../handles/logger');

module.exports = (webManager) => {
    const router = express.Router();

    // 路由一：获取内存中缓存的历史日志 (用于页面刚打开时的数据初始化)
    router.get('/', webManager.requireAuth, (req, res) => {
        res.json({
            code: 200,
            data: logCache
        });
    });

    // 路由二：建立 SSE 实时流连接 (Server-Sent Events)
    router.get('/stream', webManager.requireAuth, (req, res) => {
        // 设置 SSE 必需的响应头，告诉浏览器这是一个持久的数据流
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        // 禁用 Nginx 等反向代理的缓存，确保消息实时到达
        res.setHeader('X-Accel-Buffering', 'no');

        // 发送一个初始消息确认连接成功
        res.write(`data: ${JSON.stringify({ level: 'info', plugin: 'System', msg: '日志实时流已连接', time: new Date().toLocaleString() })}\n\n`);

        // 定义日志推送回调：收到新日志立刻序列化发送
        const onNewLog = (logEntry) => {
            res.write(`data: ${JSON.stringify(logEntry)}\n\n`);
        };

        // 监听我们在 logger.js 抛出的 'new-log' 事件
        logEmitter.on('new-log', onNewLog);

        // 【非常重要】当客户端断开连接（如关闭网页或切换路由）时，销毁监听器防止内存泄漏
        req.on('close', () => {
            // console.log('[WebManager] 前端已断开日志流连接');
            logEmitter.removeListener('new-log', onNewLog);
        });
    });

    return router;
};