import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	ItemView,
	WorkspaceLeaf,
	TFile,
	Notice,
	Modal,
	TextComponent,
} from "obsidian";
import { Encrypt } from "encrypt";

interface EncryptPluginSettings {
	workingDirectory: string;
	documentDirectory: string;
	encryptionKey: string;
	autoEncryptionDecryption: boolean;
}

const DEFAULT_SETTINGS: EncryptPluginSettings = {
	workingDirectory: "",
	documentDirectory: "",
	encryptionKey: "",
	autoEncryptionDecryption: false,
};

const VIEW_TYPE_ENCRYPT_DOCUMENTS = "encryption-documents-view";

export default class EncryptPlugin extends Plugin {
	settings: EncryptPluginSettings;
	private lastActiveFile: TFile | null = null;
    private onFileOpen: (file: TFile | null) => any;

	async onload() {
		await this.loadSettings();

		// 注册文档列表视图
		this.registerView(
			VIEW_TYPE_ENCRYPT_DOCUMENTS,
			(leaf) => new EncryptDocumentsView(leaf, this)
		);

		// 添加侧边栏图标
		this.addRibbonIcon("shield", "Encryption Document Management", () => {
			this.activateView();
		});

		// 添加命令
		this.addCommand({
			id: "open-encrypt-documents",
			name: "Open Encryption Document Management",
			callback: () => {
				this.activateView();
			},
		});

		// 添加设置选项卡
		this.addSettingTab(new EncryptSettingTab(this.app, this));

		this.app.workspace.on("file-open", (file: TFile | null) => {
            if (this.onFileOpen!= null){
                this.onFileOpen(file)
            }
            if (!this.settings.autoEncryptionDecryption)
                return

			if (file !== this.lastActiveFile) {
				this.decryptFile(file!);
                if (this.lastActiveFile !== null)
				    this.encryptFile(this.lastActiveFile!);
				this.lastActiveFile = file;
			}
		});

		this.app.workspace.on("quit", (tasks) => {
            if (!this.settings.autoEncryptionDecryption)
                return

			if (this.lastActiveFile !== null) {
				this.encryptFile(this.lastActiveFile!);
			}
		});
	}

    on(name: 'file-open', callback: (file: TFile | null) => any)
    {
        this.onFileOpen = callback;
    }

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_ENCRYPT_DOCUMENTS);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_ENCRYPT_DOCUMENTS);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({
				type: VIEW_TYPE_ENCRYPT_DOCUMENTS,
				active: true,
			});
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	// 获取文档列表
	getDocumentFiles(): TFile[] {
		// const activeFile = this.app.workspace.getActiveFile();
		const files =this.app.vault.getMarkdownFiles(); //  activeFile ? [activeFile] : [];
		const docDir = this.settings.documentDirectory.trim();

		if (!docDir) {
			return files;
		}

		return files.filter((file) => file.path.startsWith(docDir));
	}

	async encryptFile(file: TFile) {
		try {
			const content = await this.app.vault.readBinary(file);
			// 检查是否已经加密
			if (content.byteLength == 0) {
				new Notice("文件为空");
				return;
			}
			const encryptedContent = Encrypt.encryptText(
				content,
				this.settings.encryptionKey
			);
			await this.app.vault.modifyBinary(file, encryptedContent);
			new Notice(`文件 ${file.basename} 加密成功`);
		} catch (error) {
			new Notice(`加密失败: ${error.message}`);
		}
	}

	async decryptFile(file: TFile) {
		try {
			const content = await this.app.vault.readBinary(file);

			// if (!content.startsWith('ENCRYPT_ENCRYPTED:')) {
			//     new Notice('文件不是 Encryption 加密格式');
			//     return;
			// }

			const encryptedData = content; //.substring('ENCRYPT_ENCRYPTED:'.length);
			const decrypted = Encrypt.decryptText(
				encryptedData,
				this.settings.encryptionKey
			);

			await this.app.vault.modifyBinary(file, decrypted);
			new Notice(`文件 ${file.basename} 解密成功`);
		} catch (error) {
			new Notice(`解密失败: ${error.message}`);
		}
	}
}

// 文档列表视图
class EncryptDocumentsView extends ItemView {
	plugin: EncryptPlugin;
	containerEl: HTMLElement;

	constructor(leaf: WorkspaceLeaf, plugin: EncryptPlugin) {
		super(leaf);
		this.plugin = plugin;
        this.plugin.on("file-open", file=>{
            this.refresh();
        })
	}

	getViewType() {
		return VIEW_TYPE_ENCRYPT_DOCUMENTS;
	}

	getDisplayText() {
		return "Encryption Document Management";
	}

	getIcon() {
		return "shield";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();

		this.containerEl = container.createEl("div", {
			cls: "encrypt-documents-view",
		});
		this.refresh();
	}

	async onClose() {
		// 清理资源
	}

	async refresh() {
		this.containerEl.empty();

		// 标题
		const titleEl = this.containerEl.createEl("div", {
			cls: "encrypt-title",
		});
		titleEl.createEl("h3", { text: "DOCUMENTS" });

		// 刷新按钮
		const refreshBtn = titleEl.createEl("button", { text: "刷新" }); // , cls: 'mod-cta'
		refreshBtn.onclick = () => this.refresh();

		// 检查设置
		if (!this.plugin.settings.encryptionKey) {
			const warningEl = this.containerEl.createEl("div", {
				cls: "encrypt-warning",
			});
			warningEl.createEl("p", { text: "⚠️ 请先在设置中配置加密密钥" });
			return;
		}

		// 文档列表
		const files = this.plugin.getDocumentFiles();

		if (files.length === 0) {
			const emptyEl = this.containerEl.createEl("div", {
				cls: "encrypt-empty",
			});
			emptyEl.createEl("p", { text: "没有找到文档文件" });
			return;
		}

		const listEl = this.containerEl.createEl("div", {
			cls: "encrypt-file-list",
		});

		files.forEach((file) => {
			const fileEl = listEl.createEl("div", { cls: "encrypt-file-item" });

			const infoEl = fileEl.createEl("div", { cls: "encrypt-file-info" });
			infoEl.createEl("div", {
				text: file.basename,
				cls: "encrypt-file-name",
			});
			infoEl.createEl("div", {
				text: file.path,
				cls: "encrypt-file-path",
			});

			const actionsEl = fileEl.createEl("div", {
				cls: "encrypt-file-actions",
			});

			// 加密按钮
			const encryptBtn = actionsEl.createEl("button", { text: "加密" }); // , cls: 'mod-warning'
			encryptBtn.onclick = async () => {
				await this.plugin.encryptFile(file);
				await this.app.workspace.getLeaf().detach();
			}

			// 解密按钮
			const decryptBtn = actionsEl.createEl("button", { text: "解密" }); //, cls: 'mod-success'
			decryptBtn.onclick = async () => {
				await this.plugin.decryptFile(file);
				await this.app.workspace.getLeaf().openFile(file);
			}
		});
	}
}

// 设置选项卡
class EncryptSettingTab extends PluginSettingTab {
	plugin: EncryptPlugin;
	username: string;
	password: string;

	constructor(app: App, plugin: EncryptPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.username = "";
		this.password = "";
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Encryption 加解密插件设置" });

		// 工作目录设置
		new Setting(containerEl)
			.setName("工作目录")
			.setDesc("设置插件的工作目录（可选）")
			.addText((text) =>
				text
					.setPlaceholder("例如: work/")
					.setValue(this.plugin.settings.workingDirectory)
					.onChange(async (value) => {
						this.plugin.settings.workingDirectory = value;
						await this.plugin.saveSettings();
					})
			);

		// 文档目录设置
		new Setting(containerEl)
			.setName("文档所在目录")
			.setDesc("设置要管理的文档所在目录（可选，留空则显示所有文档）")
			.addText((text) =>
				text
					.setPlaceholder("例如: documents/")
					.setValue(this.plugin.settings.documentDirectory)
					.onChange(async (value) => {
						this.plugin.settings.documentDirectory = value;
						await this.plugin.saveSettings();
					})
			);

		// 是否自动加解密
		new Setting(containerEl)
			.setName("自动加解密")
			.setDesc("打开文档自动解密， 关闭文档自动加密")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.autoEncryptionDecryption)
					.onChange(async (value) => {
						this.plugin.settings.autoEncryptionDecryption = value;
					});
			});

		// 加密密钥设置
		new Setting(containerEl)
			.setName("加密密钥")
			.setDesc(
				"设置 Encryption 加密的密钥（请妥善保管，丢失将无法解密文件）"
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("输入加密密钥")
					.setValue(this.plugin.settings.encryptionKey)
					.onChange(async (value) => {
						this.plugin.settings.encryptionKey = value;
						await this.plugin.saveSettings();
					});
			});

		// 生成随机密钥按钮
		new Setting(containerEl)
			.setName("生成随机密钥")
			.setDesc("根据用户名及密码生成密钥")
			.addText((text) => {
				text.setPlaceholder("输入用户名")
					.setValue(this.username)
					.onChange(async (value) => {
						this.username = value;
					});
			})
			.addText((text) => {
				text.setPlaceholder("输入密码")
					.setValue(this.password)
					.onChange(async (value) => {
						this.password = value;
					});
			})
			.addButton((button) =>
				button
					.setButtonText("生成密钥")
					// .setCta()
					.onClick(async () => {
						if (!this.username?.trim() || !this.password?.trim()) {
							new Notice("未输入用户名或密码", 3000);
							return;
						}
						const randomKey =
							CryptoJS.lib.WordArray.random(32).toString();
						this.plugin.settings.encryptionKey =
							CryptoJS.SHA256(this.username)
								.toString()
								.slice(0, 16) +
							CryptoJS.SHA256(this.password)
								.toString()
								.slice(0, 64);
						await this.plugin.saveSettings();
						this.display(); // 刷新设置页面
						new Notice("已生成新的加密密钥");
					})
			);

		// 安全提示
		containerEl.createEl("div", {
			cls: "setting-item-description",
		}).innerHTML = `
                <h3>⚠️ 安全提示：</h3>
                <ul>
                    <li>请务必备份您的加密密钥，丢失密钥将无法恢复加密文件</li>
                    <li>建议定期更换加密密钥以提高安全性</li>
                    <li>加密后的文件在 Obsidian 中将显示为加密内容</li>
                    <li>请确保在安全的环境中使用此插件</li>
                </ul>
            `;
	}
}
