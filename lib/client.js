window.__ModuleLoader__.load({
	id: "dsh-reject-policy",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		// src/shared.ts
		/** 列出可广告的 mode 值，给设置 UI / 命令校验用。 */
		const REJECT_MODES = ["default", "stop"];
		/** settings 命名空间 / profile patch 行 id / configForms entry id；三者共用。 */
		const REJECT_POLICY_SETTINGS_NAMESPACE = "reject-policy";
		/**
		* `plugins.row.config` 注册 key：`<包名>#<行 id>`（行 id 即 patch 声明的
		* `id: reject-policy`）。Plugins 页据此给 `reject-policy` 行渲染 Configure 控件。
		*/
		const REJECT_POLICY_ROW_CONFIG_KEY = `dsh-reject-policy#${REJECT_POLICY_SETTINGS_NAMESPACE}`;
		// \0dsh-css:/Users/vren/projects/dsh_plugin_dev/dsh-reject-policy/src/client/RejectPolicyCard.module.css.mjs
		const css$1 = ".lxJuWW_summary{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:1.5}.lxJuWW_readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}.lxJuWW_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}.lxJuWW_fieldHead{align-items:center;gap:12px;display:flex}.lxJuWW_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}.lxJuWW_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}.lxJuWW_dropdownTrigger{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);min-width:160px;max-width:220px;height:32px;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;text-align:left;border-radius:8px;justify-content:space-between;align-items:center;gap:8px;padding:0 12px;font-size:13px;line-height:1.5;display:inline-flex}.lxJuWW_dropdownTrigger:hover:not(:disabled){border-color:var(--dsw-alias-border-l3)}.lxJuWW_dropdownTrigger:disabled{cursor:default;opacity:.4}.lxJuWW_dropdownChevron{color:var(--dsw-alias-label-tertiary);flex:none}.lxJuWW_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}.lxJuWW_discard,.lxJuWW_save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}.lxJuWW_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}.lxJuWW_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}.lxJuWW_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}.lxJuWW_discard:disabled,.lxJuWW_save:disabled{opacity:.4;cursor:default}.lxJuWW_discard:focus-visible,.lxJuWW_save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}";
		const tagId$1 = "dsh-reject-policy/RejectPolicyCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-reject-policy";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var RejectPolicyCard_module_css_default = {
			"discard": "lxJuWW_discard",
			"dropdownChevron": "lxJuWW_dropdownChevron",
			"dropdownTrigger": "lxJuWW_dropdownTrigger",
			"field": "lxJuWW_field",
			"fieldHead": "lxJuWW_fieldHead",
			"footer": "lxJuWW_footer",
			"hint": "lxJuWW_hint",
			"label": "lxJuWW_label",
			"readOnly": "lxJuWW_readOnly",
			"save": "lxJuWW_save",
			"summary": "lxJuWW_summary"
		};
		// src/client/RejectPolicyCard.tsx
		/**
		* RejectPolicyCard — the `plugins.row.config` page for dsh-reject-policy.
		*
		* Rendered inside the Plugins page's row detail view (opened from the
		* Configure control on the `reject-policy` row of the `dsh-reject-policy`
		* bundle). The page owns the title, crumb, icon, and description chrome and
		* drops staged edits when the page is left; this card draws only the form:
		* one dropdown (Stop / Default) staged locally, written on Save.
		*
		* Values come from the page-supplied `form` (`ConfigPageForm`): `form.state`
		* is the live snapshot of the `reject-policy` namespace on the shared
		* settings describe mirror, and `form.mutate` writes the plugin entry's
		* volatile Config into the profile patch. When the staged edit equals the
		* composition `base`, the card clears the user layer (`op: 'unset'`) instead
		* of writing a redundant override.
		*
		* `view === 'summary'` renders the one-liner the page uses as the row's
		* description fallback when the bundle supplies no description.
		*/
		/**
		* Render the reject-policy configuration page.
		* @param props - the plugin view asked for, or the form with its snapshot and write actions.
		* @returns the one-liner, the form, or nothing while the namespace is not served.
		*/
		function RejectPolicyCard(props) {
			const { t, view } = props;
			if (view === "summary") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: RejectPolicyCard_module_css_default.summary,
				children: t("description")
			});
			const form = props.form;
			const snapshot = form?.state;
			if (form === void 0 || snapshot === void 0 || snapshot.status !== "ready") return null;
			const baseValue = snapshot.base?.mode ?? "stop";
			const savedValue = snapshot.value?.mode ?? baseValue;
			const [staged, setStaged] = (0, react.useState)(void 0);
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			const [saving, setSaving] = (0, react.useState)(false);
			const [failed, setFailed] = (0, react.useState)(false);
			const anchorRef = (0, react.useRef)(null);
			const draftValue = staged ?? savedValue;
			const dirty = staged !== void 0 && staged !== savedValue;
			const writable = snapshot.writable;
			const onPick = (id) => {
				setMenuOpen(false);
				if (id === "stop" || id === "default") setStaged(id);
			};
			const onSave = async () => {
				if (!dirty || !writable || staged === void 0) return;
				setSaving(true);
				setFailed(false);
				let landed = false;
				try {
					if (staged === baseValue) landed = await form.mutate([{
						op: "unset",
						path: ["mode"]
					}]);
					else landed = await form.mutate([{
						op: "set",
						path: ["mode"],
						value: staged
					}]);
				} catch (_writeFailure) {
					landed = false;
				}
				setSaving(false);
				setFailed(!landed);
				if (landed) setStaged(void 0);
			};
			const onDiscard = () => {
				if (!dirty) return;
				setStaged(void 0);
				setFailed(false);
			};
			const labelFor = (value) => t(value === "stop" ? "option.stop" : "option.default");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: RejectPolicyCard_module_css_default.page,
				children: [
					!writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: RejectPolicyCard_module_css_default.readOnly,
						role: "status",
						children: t("readOnly")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: RejectPolicyCard_module_css_default.field,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: RejectPolicyCard_module_css_default.fieldHead,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: RejectPolicyCard_module_css_default.label,
								children: t("field.mode")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
								open: menuOpen,
								anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									ref: anchorRef,
									type: "button",
									className: `${RejectPolicyCard_module_css_default.dropdownTrigger} ${menuOpen ? RejectPolicyCard_module_css_default.dropdownOpen : ""}`,
									onClick: () => {
										setMenuOpen(!menuOpen);
									},
									disabled: !writable,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: labelFor(draftValue) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {
										size: 14,
										className: RejectPolicyCard_module_css_default.dropdownChevron
									})]
								}),
								items: REJECT_MODES.map((mode) => ({
									id: mode,
									label: labelFor(mode)
								})),
								selectedId: draftValue,
								onSelect: onPick,
								onClose: () => {
									setMenuOpen(false);
								},
								side: "bottom",
								align: "start"
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: RejectPolicyCard_module_css_default.hint,
							children: t("field.mode.hint")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: RejectPolicyCard_module_css_default.footer,
						children: [
							failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: RejectPolicyCard_module_css_default.readOnly,
								role: "status",
								children: t("saveFailed")
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: RejectPolicyCard_module_css_default.discard,
								disabled: !dirty || saving,
								onClick: onDiscard,
								children: t("discard")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: RejectPolicyCard_module_css_default.save,
								disabled: !dirty || !writable || saving,
								onClick: () => {
									onSave();
								},
								children: t(saving ? "saving" : "save")
							})
						]
					})
				]
			});
		}
		// \0dsh-css:/Users/vren/projects/dsh_plugin_dev/dsh-reject-policy/src/client/RejectPolicyDock.module.css.mjs
		const css = ".-lNIIW_dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));flex:none;align-items:center;gap:8px;margin:0 auto;display:flex}.-lNIIW_bar{isolation:isolate;box-sizing:border-box;appearance:none;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);min-width:0;height:36px;box-shadow:var(--dsw-elevation-panel);font:inherit;cursor:pointer;text-align:left;background:0 0;border:0;flex:1;align-items:center;gap:10px;padding:4px 5px 4px 12px;display:flex;position:relative}.-lNIIW_bar:before{z-index:-1;border-radius:inherit;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);content:\"\";pointer-events:none;position:absolute;inset:0}.-lNIIW_bar:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.-lNIIW_bar[aria-disabled=true]{opacity:.5;cursor:not-allowed}.-lNIIW_pending{opacity:.6}.-lNIIW_glyph{color:var(--dsw-alias-label-tertiary);flex:none;display:inline-flex}.-lNIIW_label{color:var(--dsw-alias-label-primary);flex:none;font-size:13px;font-weight:500;line-height:24px}.-lNIIW_mode{border:1px solid #0000;border-radius:999px;flex:none;margin-left:auto;padding:1px 10px;font-size:12px;font-weight:500;line-height:20px}.-lNIIW_mode[data-mode=stop]{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}.-lNIIW_mode[data-mode=default]{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}.-lNIIW_error{text-overflow:ellipsis;white-space:nowrap;max-width:45%;color:var(--dsw-alias-state-error-primary);flex:none;font-size:12px;line-height:20px;overflow:hidden}.-lNIIW_srOnly{clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0;width:1px;height:1px;margin:-1px;padding:0;position:absolute;overflow:hidden}";
		const tagId = "dsh-reject-policy/RejectPolicyDock.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-reject-policy";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var RejectPolicyDock_module_css_default = {
			"bar": "-lNIIW_bar",
			"dock": "-lNIIW_dock",
			"error": "-lNIIW_error",
			"glyph": "-lNIIW_glyph",
			"label": "-lNIIW_label",
			"mode": "-lNIIW_mode",
			"pending": "-lNIIW_pending",
			"srOnly": "-lNIIW_srOnly"
		};
		// src/client/RejectPolicyDock.tsx
		/**
		* RejectPolicyDock — the persistent `mode` switch above the composer.
		*
		* Registered into `conversation.input.dock` (the strip that also carries
		* the Todo panel, the GoalBar, and the Queue dock). The strip shows the
		* live `mode` at a glance and toggles it in place: no page navigation and
		* no staged Save, because `mode` is a per-task runtime rule, not install
		* configuration — burying it behind Plugins → Configure → Save makes the
		* toggle effectively unreachable mid-conversation.
		*
		* Reads and writes ride the SAME shared settings form the Plugins-page card
		* edits (`ctx.configForms.get(REJECT_POLICY_SETTINGS_NAMESPACE)` in the
		* registering `src/client/index.ts`), so the dock and the card can never
		* disagree: both re-render from the one describe mirror, and both write
		* through the one Host write queue. Reverting to the composition base
		* clears the user override (`unset`) instead of writing a redundant one —
		* the same rule the card applies on Save.
		*
		* Renders nothing while the namespace is not served or the mirror has not
		* accepted a section yet (`status !== 'ready'`). A read-only settings
		* provider (`writable === false`; the shipped one always reports writable)
		* keeps the switch visibly inert — the bar dims via `aria-disabled` and the
		* tooltip explains through the shared `readOnly` copy. The button never
		* takes a real `disabled` attribute: disabled buttons fire no hover/focus
		* events, which would make that explanation unreachable.
		*/
		/**
		* Render the composer-dock mode switch, or nothing while the namespace is
		* not served yet.
		* @param props - the shared settings form plus the locale seat.
		* @returns the switch strip, or null before the first mirror section.
		*/
		function RejectPolicyDock({ form, t }) {
			const subscribe = (0, react.useCallback)((onChange) => form.subscribe(onChange), [form]);
			const getSnapshot = (0, react.useCallback)(() => form.getSnapshot(), [form]);
			const snapshot = (0, react.useSyncExternalStore)(subscribe, getSnapshot);
			const [pending, setPending] = (0, react.useState)(false);
			/** Optimistic target while the write round-trip is in flight. */
			const [optimistic, setOptimistic] = (0, react.useState)(null);
			const [failed, setFailed] = (0, react.useState)(false);
			/** Last mode whose write landed — drives the screen-reader announcement. */
			const [landed, setLanded] = (0, react.useState)(null);
			if (snapshot.status !== "ready") return null;
			const baseMode = snapshot.base?.mode ?? "stop";
			const persisted = snapshot.value?.mode ?? baseMode;
			const mode = optimistic ?? persisted;
			const writable = snapshot.writable;
			const onToggle = async () => {
				if (pending || !writable) return;
				setPending(true);
				setFailed(false);
				const target = mode === "stop" ? "default" : "stop";
				setOptimistic(target);
				let landedNow = false;
				try {
					landedNow = target === baseMode ? await form.unset("mode") : await form.set("mode", target);
				} catch (_writeFailure) {
					landedNow = false;
				}
				setPending(false);
				setOptimistic(null);
				if (landedNow) setLanded(target);
				setFailed(!landedNow);
			};
			const stop = mode === "stop";
			const tooltip = !writable ? t("readOnly") : t(stop ? "dock.hint.stop" : "dock.hint.default");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: RejectPolicyDock_module_css_default.dock,
				"data-reject-policy-dock": true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						portal: true,
						label: tooltip,
						side: "bottom",
						delayMs: 500,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							role: "switch",
							"aria-checked": stop,
							className: `${RejectPolicyDock_module_css_default.bar} ${pending ? RejectPolicyDock_module_css_default.pending : ""}`,
							"aria-disabled": !writable,
							"aria-busy": pending,
							"aria-label": t("dock.title"),
							onClick: () => {
								onToggle();
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: RejectPolicyDock_module_css_default.glyph,
									"aria-hidden": true,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconShieldOutlineRegular, { size: 14 })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: RejectPolicyDock_module_css_default.label,
									children: t("dock.title")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: RejectPolicyDock_module_css_default.mode,
									"data-mode": mode,
									children: t(stop ? "dock.mode.stop" : "dock.mode.default")
								})
							]
						})
					}),
					landed !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: RejectPolicyDock_module_css_default.srOnly,
						role: "status",
						children: `${t("dock.title")}: ${t(landed === "stop" ? "dock.mode.stop" : "dock.mode.default")}`
					}) : null,
					failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: RejectPolicyDock_module_css_default.error,
						role: "alert",
						children: t("dock.saveFailed")
					}) : null
				]
			});
		}
		// src/client/locales.ts
		const en = {
			"title": "Reject Policy",
			"description": "Controls how the plugin rewrites the rejection feedback and whether rejecting a tool call also stops the current agent turn.",
			"readOnly": "The settings document is read-only in this deployment; changes here would have no effect.",
			"field.mode": "Turn-stop on rejection",
			"field.mode.hint": "When on, a rejected tool call ends the current agent turn (no further LLM call). When off, the model only sees the rewritten rejection message and can continue iterating.",
			"option.stop": "On (stop turn)",
			"option.default": "Off (continue)",
			"discard": "Discard",
			"save": "Save",
			"saving": "Saving",
			"saveFailed": "Save did not land; your changes are still staged.",
			"dock.title": "Reject policy",
			"dock.mode.stop": "Stop on reject",
			"dock.mode.default": "Continue after reject",
			"dock.hint.stop": "A rejected tool call ends the current agent turn. Click to let the agent continue instead — applies immediately.",
			"dock.hint.default": "The agent continues after a rejected tool call. Click to end the turn on the next rejection instead — applies immediately.",
			"dock.saveFailed": "Switch did not land; try again."
		};
		const zh = {
			"title": "拒绝策略",
			"description": "控制插件如何改写拒绝反馈，以及用户拒绝 tool 调用时是否一并停止当前 agent turn。",
			"readOnly": "当前部署的 settings 文档为只读；此处修改不会生效。",
			"field.mode": "拒绝时停止 turn",
			"field.mode.hint": "开启后，被拒的 tool 调用会直接结束当前 agent turn（不再发起新一轮 LLM 调用）。关闭时，模型仅看到改写后的拒绝消息，可继续迭代。",
			"option.stop": "开启（停止 turn）",
			"option.default": "关闭（继续）",
			"discard": "放弃",
			"save": "保存",
			"saving": "保存中",
			"saveFailed": "保存未生效；改动暂存中。",
			"dock.title": "拒绝策略",
			"dock.mode.stop": "拒绝即停",
			"dock.mode.default": "拒绝后继续",
			"dock.hint.stop": "被拒的 tool 调用会直接结束当前 agent turn。点击改为继续迭代（立即生效）。",
			"dock.hint.default": "被拒后 agent 会继续迭代。点击改为「下次拒绝即停 turn」（立即生效）。",
			"dock.saveFailed": "切换未生效，请重试。"
		};
		// src/client/index.ts
		/** Dictionary namespace owned by these surfaces. */
		const NS = "reject-policy";
		/** Required services: slot registry, locale registry, settings forms. */
		const inject = [
			"slots",
			"locale",
			"configForms"
		];
		/**
		* Client plugin body: register the row configuration page and the
		* composer-dock mode switch.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "reject-policy: card dictionary");
			ctx.effect(() => ctx.configForms.whileServed([REJECT_POLICY_SETTINGS_NAMESPACE], () => ctx.slots.inject("plugins.row.config", () => ctx.slots.register({
				name: "plugins.row.config",
				key: REJECT_POLICY_ROW_CONFIG_KEY,
				locale: NS
			}, RejectPolicyCard))), "reject-policy: plugins row config page");
			ctx.effect(() => ctx.configForms.whileServed([REJECT_POLICY_SETTINGS_NAMESPACE], () => ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "reject-policy",
				order: 15,
				locale: NS,
				inject: () => ({ form: ctx.configForms.get(REJECT_POLICY_SETTINGS_NAMESPACE) })
			}, RejectPolicyDock))), "reject-policy: composer dock switch");
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map