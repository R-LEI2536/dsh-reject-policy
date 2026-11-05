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
		// \0dsh-css:/home/hive/projects/dsh-plugin_dev/dsh-reject-policy/src/client/RejectPolicyCard.module.css.mjs
		const css = ".Pt0M7a_summary{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:1.5}.Pt0M7a_readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}.Pt0M7a_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}.Pt0M7a_fieldHead{align-items:center;gap:12px;display:flex}.Pt0M7a_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}.Pt0M7a_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}.Pt0M7a_dropdownTrigger{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);min-width:160px;max-width:220px;height:32px;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;text-align:left;border-radius:8px;justify-content:space-between;align-items:center;gap:8px;padding:0 12px;font-size:13px;line-height:1.5;display:inline-flex}.Pt0M7a_dropdownTrigger:hover:not(:disabled){border-color:var(--dsw-alias-border-l3)}.Pt0M7a_dropdownTrigger:disabled{cursor:default;opacity:.4}.Pt0M7a_dropdownChevron{color:var(--dsw-alias-label-tertiary);flex:none}.Pt0M7a_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}.Pt0M7a_discard,.Pt0M7a_save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}.Pt0M7a_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}.Pt0M7a_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}.Pt0M7a_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}.Pt0M7a_discard:disabled,.Pt0M7a_save:disabled{opacity:.4;cursor:default}.Pt0M7a_discard:focus-visible,.Pt0M7a_save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}";
		const tagId = "dsh-reject-policy/RejectPolicyCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-reject-policy";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var RejectPolicyCard_module_css_default = {
			"label": "Pt0M7a_label",
			"readOnly": "Pt0M7a_readOnly",
			"footer": "Pt0M7a_footer",
			"save": "Pt0M7a_save",
			"discard": "Pt0M7a_discard",
			"field": "Pt0M7a_field",
			"fieldHead": "Pt0M7a_fieldHead",
			"hint": "Pt0M7a_hint",
			"dropdownTrigger": "Pt0M7a_dropdownTrigger",
			"summary": "Pt0M7a_summary",
			"dropdownChevron": "Pt0M7a_dropdownChevron"
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
			"saveFailed": "Save did not land; your changes are still staged."
		};
		const zh = {
			"title": "拒答策略",
			"description": "控制插件如何改写拒绝反馈，以及用户拒绝 tool 调用时是否一并停止当前 agent turn。",
			"readOnly": "当前部署的 settings 文档为只读；此处修改不会生效。",
			"field.mode": "拒绝时停止 turn",
			"field.mode.hint": "开启后，被拒的 tool 调用会直接结束当前 agent turn（不再发起新一轮 LLM 调用）。关闭时，模型仅看到改写后的拒绝消息，可继续迭代。",
			"option.stop": "开启（停止 turn）",
			"option.default": "关闭（继续）",
			"discard": "放弃",
			"save": "保存",
			"saving": "保存中",
			"saveFailed": "保存未生效；改动暂存中。"
		};
		// src/client/index.ts
		/** Dictionary namespace owned by this card. */
		const NS = "reject-policy";
		/** Required services: slot registry, locale registry, settings forms. */
		const inject = [
			"slots",
			"locale",
			"configForms"
		];
		/**
		* Client plugin body: register the row configuration page.
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
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map