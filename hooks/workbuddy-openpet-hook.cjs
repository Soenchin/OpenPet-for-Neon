#!/usr/bin/env node
'use strict';

/**
 * WorkBuddy → OpenPet bridge
 *
 * Lives next to the installed app under:
 *   X:/CC/projects/pets/openpetsexe/hooks/workbuddy-openpet-hook.cjs
 *
 * Mapping:
 *   UserPromptSubmit → thinking
 *   PreToolUse       → tool-running
 *   PostToolUse      → tool-running / failure(if tool error)
 *   Stop (real)      → success
 *   Notification     → attention / failure(if error-ish)
 *   SessionStart     → attention
 *   SessionEnd       → success
 *   PreCompact       → reviewing
 *
 * WorkBuddy settings command example:
 *   node "X:/CC/projects/pets/openpetsexe/hooks/workbuddy-openpet-hook.cjs" UserPromptSubmit
 *
 * Failures are silent so WorkBuddy is never blocked.
 */

const http = require('http');

const OPENPET_HOST = process.env.OPENPET_HOST || '127.0.0.1';
const OPENPET_PORT = Number(process.env.OPENPET_PORT || 17321);
const POST_TIMEOUT = Number(process.env.OPENPET_HOOK_TIMEOUT_MS || 150);

const EVENT_MAP = {
  SessionStart: { type: 'attention', message: '会话开始' },
  SessionEnd: { type: 'success', message: '会话结束' },
  UserPromptSubmit: { type: 'thinking', message: '思考中…' },
  PreToolUse: { type: 'tool-running', message: '调用工具…' },
  PreCompact: { type: 'reviewing', message: '整理上下文…' },
};

function readStdinJson() {
  return new Promise(function (resolve) {
    let data = '';
    let settled = false;
    function finish(value) {
      if (settled) return;
      settled = true;
      resolve(value);
    }

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (chunk) {
      data += chunk;
    });
    process.stdin.on('end', function () {
      try {
        finish(data ? JSON.parse(data) : {});
      } catch (e) {
        finish({});
      }
    });
    if (process.stdin.isTTY) finish({});
    setTimeout(function () {
      try {
        finish(data ? JSON.parse(data) : {});
      } catch (e) {
        finish({});
      }
    }, 80);
  });
}

function resolveHookEvent(payload) {
  return (
    process.argv[2] ||
    process.env.WORKBUDDY_HOOK_EVENT ||
    process.env.CODEBUDDY_HOOK_EVENT ||
    process.env.HOOK_EVENT_NAME ||
    payload.hook_event_name ||
    payload.hookEventName ||
    payload.event_name ||
    payload.eventName ||
    payload.event ||
    ''
  );
}

function postJson(path, bodyObj) {
  return new Promise(function (resolve) {
    const body = JSON.stringify(bodyObj);
    const req = http.request(
      {
        hostname: OPENPET_HOST,
        port: OPENPET_PORT,
        path: path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      function (res) {
        res.resume();
        res.on('end', resolve);
      }
    );
    req.setTimeout(POST_TIMEOUT, function () {
      req.destroy();
      resolve();
    });
    req.on('error', resolve);
    req.write(body);
    req.end();
  });
}

function postEvent(type, message, ttlMs) {
  const payload = { type: type };
  if (message) payload.message = message;
  if (ttlMs) payload.ttlMs = ttlMs;
  return postJson('/api/event', payload);
}

function asText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

function looksLikeFailure(payload) {
  if (!payload || typeof payload !== 'object') return false;

  // common explicit flags
  if (payload.is_error === true || payload.isError === true) return true;
  if (payload.success === false || payload.ok === true && payload.error) return !!payload.error;
  if (payload.ok === false || payload.success === false) return true;

  // tool result shapes
  const toolResult = payload.tool_result || payload.toolResult || payload.result || null;
  if (toolResult && typeof toolResult === 'object') {
    if (toolResult.is_error === true || toolResult.isError === true) return true;
    if (toolResult.success === false || toolResult.ok === false) return true;
    if (toolResult.error) return true;
  }

  // status / error fields
  const status = String(payload.status || payload.outcome || payload.result_status || '').toLowerCase();
  if (['error', 'failed', 'failure', 'fail', 'denied', 'cancelled', 'canceled', 'timeout'].includes(status)) {
    return true;
  }

  const notifType = String(
    payload.notification_type || payload.notificationType || payload.type || ''
  ).toLowerCase();
  if (
    notifType.includes('error') ||
    notifType.includes('fail') ||
    notifType.includes('denied') ||
    notifType.includes('permission') && notifType.includes('reject')
  ) {
    return true;
  }

  // message heuristics as last resort
  const msg = (
    asText(payload.message) +
    ' ' +
    asText(payload.error) +
    ' ' +
    asText(payload.summary)
  ).toLowerCase();
  if (
    msg.includes('failed') ||
    msg.includes('failure') ||
    msg.includes('error') ||
    msg.includes('exception') ||
    msg.includes('denied') ||
    msg.includes('timeout') ||
    msg.includes('失败') ||
    msg.includes('报错') ||
    msg.includes('出错')
  ) {
    return true;
  }

  return false;
}

function failureMessage(payload, fallback) {
  const candidates = [
    payload.message,
    payload.error && payload.error.message,
    payload.error,
    payload.summary,
    payload.tool_name && ('工具失败: ' + payload.tool_name),
    payload.toolName && ('工具失败: ' + payload.toolName),
  ];
  for (let i = 0; i < candidates.length; i++) {
    const text = asText(candidates[i]).trim();
    if (text) return text.slice(0, 120);
  }
  return fallback || '出错了';
}

function writeHookResponse(hookEventName) {
  if (hookEventName === 'PreToolUse') {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
  } else {
    process.stdout.write('{}');
  }
}

async function main() {
  const payload = await readStdinJson();
  const hookEventName = String(resolveHookEvent(payload) || '');

  try {
    if (hookEventName === 'Stop') {
      // stop_hook_active=true means continue-from-hook, not real completion
      if (!payload.stop_hook_active) {
        if (looksLikeFailure(payload)) {
          await postEvent('failure', failureMessage(payload, '任务失败'), 5000);
        } else {
          await postEvent('success', '搞定', 4000);
        }
      }
      writeHookResponse(hookEventName);
      process.exit(0);
    }

    if (hookEventName === 'PostToolUse') {
      if (looksLikeFailure(payload)) {
        await postEvent('failure', failureMessage(payload, '工具失败'), 5000);
      } else {
        await postEvent('tool-running', '工具完成', 2500);
      }
      writeHookResponse(hookEventName);
      process.exit(0);
    }

    if (hookEventName === 'Notification') {
      const notifType = payload.notification_type || payload.notificationType || '';
      if (looksLikeFailure(payload)) {
        await postEvent('failure', failureMessage(payload, '出问题了'), 5000);
      } else if (notifType && notifType !== 'idle_prompt') {
        await postEvent('attention', payload.message || '需要你看一下', 5000);
      } else if (!notifType) {
        await postEvent('attention', '通知', 4000);
      }
      // idle_prompt is intentionally ignored
      writeHookResponse(hookEventName);
      process.exit(0);
    }

    const mapped = EVENT_MAP[hookEventName];
    if (mapped) {
      await postEvent(mapped.type, mapped.message, 3500);
    }
  } catch (e) {
    // ignore
  }

  writeHookResponse(hookEventName);
  process.exit(0);
}

main().catch(function () {
  process.stdout.write('{}');
  process.exit(0);
});
