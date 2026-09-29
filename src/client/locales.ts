/**
 * Locales for the reject-policy configuration page.
 *
 * One namespace (`reject-policy`) covering the page copy (title,
 * description), the field label and hint, the dropdown options, and
 * the save/discard buttons. zh + en shipped; extend by adding the
 * same key to both `en` and `zh`.
 */

export type RejectPolicyKey = keyof typeof en

export const en = {
  'title': 'Reject Policy',
  'description': 'Controls how the plugin rewrites the rejection feedback and whether rejecting a tool call also stops the current agent turn.',
  'readOnly': 'The settings document is read-only in this deployment; changes here would have no effect.',
  'field.mode': 'Turn-stop on rejection',
  'field.mode.hint': 'When on, a rejected tool call ends the current agent turn (no further LLM call). When off, the model only sees the rewritten rejection message and can continue iterating.',
  'option.stop': 'On (stop turn)',
  'option.default': 'Off (continue)',
  'discard': 'Discard',
  'save': 'Save',
  'saving': 'Saving',
  'saveFailed': 'Save did not land; your changes are still staged.',
} as const

export const zh = {
  'title': '拒答策略',
  'description': '控制插件如何改写拒绝反馈，以及用户拒绝 tool 调用时是否一并停止当前 agent turn。',
  'readOnly': '当前部署的 settings 文档为只读；此处修改不会生效。',
  'field.mode': '拒绝时停止 turn',
  'field.mode.hint': '开启后，被拒的 tool 调用会直接结束当前 agent turn（不再发起新一轮 LLM 调用）。关闭时，模型仅看到改写后的拒绝消息，可继续迭代。',
  'option.stop': '开启（停止 turn）',
  'option.default': '关闭（继续）',
  'discard': '放弃',
  'save': '保存',
  'saving': '保存中',
  'saveFailed': '保存未生效；改动暂存中。',
} as const