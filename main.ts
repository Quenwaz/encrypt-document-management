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
	setIcon 
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

interface TreeNode {
	[key: string]: TreeNode | TFile[];
	_files: TFile[];
}

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
		this.addRibbonIcon("shield", "EnDocMan", () => {
			this.activateView();
		});

		// 添加命令
		this.addCommand({
			id: "open-encrypt-documents",
			name: "Open EnDocMan",
			callback: () => {
				this.activateView();
			},
		});

		// 添加设置选项卡
		this.addSettingTab(new EncryptSettingTab(this.app, this));

		this.app.workspace.on("file-open", async (file: TFile | null) => {
			if (this.onFileOpen != null) {
				this.onFileOpen(file)
			}
			if (!this.settings.autoEncryptionDecryption)
				return

			if (file !== this.lastActiveFile) {
				await this.decryptFile(file!);
				if (this.lastActiveFile !== null)
					await this.encryptFile(this.lastActiveFile!);
				this.lastActiveFile = file;
			}

			await this.app.workspace.getLeaf().openFile(file!);
		});

		this.app.workspace.on("quit", async (tasks) => {
			if (!this.settings.autoEncryptionDecryption)
				return

			if (this.lastActiveFile !== null) {
				await this.encryptFile(this.lastActiveFile!);
			}
		});
	}

	on(name: 'file-open', callback: (file: TFile | null) => any) {
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
		const files = this.app.vault.getMarkdownFiles();
		const docDir = this.settings.documentDirectory.trim();

		if (!docDir) {
			return files;
		}

		return files.filter((file) => file.path.startsWith(docDir));
	}

	async encryptFile(file: TFile) {
		try {
			const content = await this.app.vault.readBinary(file);
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
			const decrypted = Encrypt.decryptText(
				content,
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
	private collapsedFolders: Set<string> = new Set();

	constructor(leaf: WorkspaceLeaf, plugin: EncryptPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.plugin.on("file-open", file => {
			this.refresh();
		})
	}

	getViewType() {
		return VIEW_TYPE_ENCRYPT_DOCUMENTS;
	}

	getDisplayText() {
		return "EnDocMan";
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

		// 创建头部区域
		this.createHeader();

		// 检查设置
		if (!this.plugin.settings.encryptionKey) {
			this.createWarning();
			return;
		}

		// 获取文档文件
		const files = this.plugin.getDocumentFiles();
		if (files.length === 0) {
			this.createEmptyState();
			return;
		}

		// 创建文件树
		this.createFileTree(files);
	}

	private createHeader() {
		const headerEl = this.containerEl.createEl("div", {
			cls: "encrypt-header",
		});

		const titleSection = headerEl.createEl("div", {
			cls: "encrypt-title-section",
		});

		const iconEl = titleSection.createEl("div", {
			cls: "encrypt-title-icon",
		});
		setIcon(iconEl, "shield");

		titleSection.createEl("h3", { 
			text: "EnDocMan",
			cls: "encrypt-title-text"
		});

		const actionsEl = headerEl.createEl("div", {
			cls: "encrypt-header-actions",
		});

		const refreshBtn = actionsEl.createEl("button", { 
			cls: "encrypt-action-btn encrypt-refresh-btn",
			title: "刷新列表"
		});
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.onclick = () => this.refresh();

		const collapseBtn = actionsEl.createEl("button", {
			cls: "encrypt-action-btn encrypt-collapse-btn",
			title: "收起所有文件夹"
		});
		setIcon(collapseBtn, "fold-vertical");
		collapseBtn.onclick = () => this.collapseAll();

		const expandBtn = actionsEl.createEl("button", {
			cls: "encrypt-action-btn encrypt-expand-btn",
			title: "展开所有文件夹"
		});
		setIcon(expandBtn, "unfold-vertical");
		expandBtn.onclick = () => this.expandAll();
	}

	private createWarning() {
		const warningEl = this.containerEl.createEl("div", {
			cls: "encrypt-warning",
		});
		
		const warningIcon = warningEl.createEl("div", {
			cls: "encrypt-warning-icon",
		});
		setIcon(warningIcon, "alert-triangle");

		const warningContent = warningEl.createEl("div", {
			cls: "encrypt-warning-content",
		});
		warningContent.createEl("p", { text: "请先在设置中配置加密密钥" });
		
		const settingsBtn = warningContent.createEl("button", {
			cls: "encrypt-warning-btn",
			text: "前往设置"
		});
		settingsBtn.onclick = () => {
			// @ts-ignore
			this.app.setting.open();
			// @ts-ignore
			this.app.setting.openTabById(this.plugin.manifest.id);
		};
	}

	private createEmptyState() {
		const emptyEl = this.containerEl.createEl("div", {
			cls: "encrypt-empty",
		});
		
		const emptyIcon = emptyEl.createEl("div", {
			cls: "encrypt-empty-icon",
		});
		setIcon(emptyIcon, "folder-open");

		emptyEl.createEl("p", { text: "没有找到文档文件" });
		emptyEl.createEl("p", { 
			text: "请检查文档目录设置或创建一些Markdown文件",
			cls: "encrypt-empty-subtitle"
		});
	}

	private createFileTree(files: TFile[]) {
		// 构建目录树结构
		const tree: TreeNode = { _files: [] };
		files.forEach(file => {
			const pathParts: string[] = file.path.split("/").filter(part => part);
			let current: TreeNode = tree;

			for (let i = 0; i < pathParts.length - 1; i++) {
				const part = pathParts[i];
				if (!current[part]) {
					current[part] = { _files: [] };
				}
				current = current[part] as TreeNode;
			}
			current._files.push(file);
		});

		// 创建树容器
		const treeEl = this.containerEl.createEl("div", {
			cls: "encrypt-tree",
		});

		// 渲染文件树
		this.renderTree(tree, treeEl, "", 0, true);
	}

	private renderTree(node: TreeNode, parentEl: HTMLElement, path = "", depth = 0, isLast = true) {
		const entries = Object.keys(node).filter(key => key !== "_files");
		const hasFiles = node._files && node._files.length > 0;

		// 渲染子文件夹
		entries.forEach((key, index) => {
			const isLastFolder = index === entries.length - 1 && !hasFiles;
			const folderPath = path ? `${path}/${key}` : key;
			
			this.renderFolder(
				key,
				node[key] as TreeNode,
				parentEl,
				folderPath,
				depth,
				isLastFolder
			);
		});

		// 渲染当前文件夹中的文件
		if (hasFiles) {
			node._files.forEach((file, index) => {
				const isLastFile = index === node._files.length - 1;
				this.renderFile(file, parentEl, depth, isLastFile);
			});
		}
	}

	private renderFolder(
		name: string,
		folderNode: TreeNode,
		parentEl: HTMLElement,
		folderPath: string,
		depth: number,
		isLast: boolean
	) {
		const folderEl = parentEl.createEl("div", {
			cls: "encrypt-folder",
		});

		// 文件夹头部
		const folderHeader = folderEl.createEl("div", {
			cls: "encrypt-folder-header",
		});

		// 添加层级连接线
		this.addTreeLines(folderHeader, depth, isLast, false);

		// 切换按钮
		const toggleBtn = folderHeader.createEl("span", {
			cls: "encrypt-folder-toggle",
		});

		const isCollapsed = this.collapsedFolders.has(folderPath);
		setIcon(toggleBtn, isCollapsed ? "chevron-right" : "chevron-down");

		// 文件夹图标
		const folderIcon = folderHeader.createEl("span", {
			cls: "encrypt-folder-icon",
		});
		setIcon(folderIcon, isCollapsed ? "folder" : "folder-open");

		// 文件夹名称
		const folderName = folderHeader.createEl("span", {
			text: name,
			cls: "encrypt-folder-name",
		});

		// 文件计数
		const fileCount = this.countFiles(folderNode);
		if (fileCount > 0) {
			folderHeader.createEl("span", {
				text: `(${fileCount})`,
				cls: "encrypt-file-count",
			});
		}

		// 文件夹内容
		const folderContents = folderEl.createEl("div", {
			cls: "encrypt-folder-contents",
		});

		// 设置初始状态
		if (isCollapsed) {
			folderContents.style.display = "none";
			folderHeader.classList.add("encrypt-folder-collapsed");
		}

		// 点击事件
		folderHeader.onclick = () => {
			const nowCollapsed = folderContents.style.display === "none";
			
			if (nowCollapsed) {
				folderContents.style.display = "block";
				folderHeader.classList.remove("encrypt-folder-collapsed");
				setIcon(toggleBtn, "chevron-down");
				setIcon(folderIcon, "folder-open");
				this.collapsedFolders.delete(folderPath);
			} else {
				folderContents.style.display = "none";
				folderHeader.classList.add("encrypt-folder-collapsed");
				setIcon(toggleBtn, "chevron-right");
				setIcon(folderIcon, "folder");
				this.collapsedFolders.add(folderPath);
			}
		};

		// 渲染子内容
		this.renderTree(folderNode, folderContents, folderPath, depth + 1);
	}

	private renderFile(file: TFile, parentEl: HTMLElement, depth: number, isLast: boolean) {
		const fileEl = parentEl.createEl("div", {
			cls: "encrypt-file-item",
		});

		// 文件信息部分
		const infoEl = fileEl.createEl("div", {
			cls: "encrypt-file-info",
		});

		// 添加层级连接线
		this.addTreeLines(infoEl, depth, isLast, true);

		// 文件图标
		const fileIcon = infoEl.createEl("span", {
			cls: "encrypt-file-icon",
		});
		setIcon(fileIcon, "file-text");

		// 文件名
		const fileName = infoEl.createEl("div", {
			text: file.basename,
			cls: "encrypt-file-name",
		});

		// 文件扩展名
		if (file.extension !== "md") {
			fileName.createEl("span", {
				text: `.${file.extension}`,
				cls: "encrypt-file-extension",
			});
		}

		// 操作按钮
		const actionsEl = fileEl.createEl("div", {
			cls: "encrypt-file-actions",
		});

		// 加密按钮
		const encryptBtn = actionsEl.createEl("button", { 
			cls: "encrypt-action-btn encrypt-encrypt-btn",
			title: "加密文件"
		});
		const encryptIcon = encryptBtn.createEl("span");
		setIcon(encryptIcon, "lock");
		// encryptBtn.createEl("span", { text: "加密" });
		
		encryptBtn.onclick = async (e) => {
			e.stopPropagation();
			encryptBtn.disabled = true;
			encryptBtn.innerHTML = "";
			const loadingIcon = encryptBtn.createEl("span");
			setIcon(loadingIcon, "loader");
			encryptBtn.createEl("span", { text: "加密中..." });
			loadingIcon.classList.add("encrypt-spinning");
			
			await this.plugin.encryptFile(file);
			await this.app.workspace.getLeaf().detach();
			
			encryptBtn.disabled = false;
			this.refresh();
		};

		// 解密按钮
		const decryptBtn = actionsEl.createEl("button", { 
			cls: "encrypt-action-btn encrypt-decrypt-btn",
			title: "解密文件"
		});
		const decryptIcon = decryptBtn.createEl("span");
		setIcon(decryptIcon, "unlock");
		// decryptBtn.createEl("span", { text: "解密" });
		
		decryptBtn.onclick = async (e) => {
			e.stopPropagation();
			decryptBtn.disabled = true;
			decryptBtn.innerHTML = "";
			const loadingIcon = decryptBtn.createEl("span");
			setIcon(loadingIcon, "loader");
			decryptBtn.createEl("span", { text: "解密中..." });
			loadingIcon.classList.add("encrypt-spinning");
			
			await this.plugin.decryptFile(file);
			await this.app.workspace.getLeaf().openFile(file);
			
			decryptBtn.disabled = false;
			this.refresh();
		};

		// 双击打开文件
		fileEl.ondblclick = async () => {
			await this.app.workspace.getLeaf().openFile(file);
		};

		// 添加右键菜单
		fileEl.oncontextmenu = (e) => {
			e.preventDefault();
			// 这里可以添加右键菜单功能
		};
	}

	private addTreeLines(element: HTMLElement, depth: number, isLast: boolean, isFile: boolean) {
		// 添加缩进容器
		const indentContainer = element.createEl("div", {
			cls: "encrypt-indent-container",
		});
		
		// 设置缩进宽度
		indentContainer.style.width = `${depth * 24}px`;
		
		// 添加每一层的连接线
		for (let i = 0; i < depth; i++) {
			const line = indentContainer.createEl("div", {
				cls: "encrypt-tree-line",
			});
			line.style.left = `${i * 24}px`;
			
			if (i === depth - 1) {
				// 最后一层的连接线
				line.classList.add(isLast ? "encrypt-tree-line-last" : "encrypt-tree-line-middle");
			} else {
				// 中间层的连接线
				line.classList.add("encrypt-tree-line-vertical");
			}
		}
	}

	private countFiles(node: TreeNode): number {
		let count = node._files ? node._files.length : 0;
		
		Object.keys(node).forEach(key => {
			if (key !== "_files") {
				count += this.countFiles(node[key] as TreeNode);
			}
		});
		
		return count;
	}

	private collapseAll() {
		const folders = this.containerEl.querySelectorAll('.encrypt-folder-header');
		folders.forEach(header => {
			const folderEl = header.parentElement;
			const contents = folderEl?.querySelector('.encrypt-folder-contents') as HTMLElement;
			const toggle = header.querySelector('.encrypt-folder-toggle');
			const icon = header.querySelector('.encrypt-folder-icon');
			
			if (contents && contents.style.display !== "none") {
				contents.style.display = "none";
				header.classList.add("encrypt-folder-collapsed");
				if (toggle) setIcon(toggle as HTMLElement, "chevron-right");
				if (icon) setIcon(icon as HTMLElement, "folder");
			}
		});
	}

	private expandAll() {
		this.collapsedFolders.clear();
		const folders = this.containerEl.querySelectorAll('.encrypt-folder-header');
		folders.forEach(header => {
			const folderEl = header.parentElement;
			const contents = folderEl?.querySelector('.encrypt-folder-contents') as HTMLElement;
			const toggle = header.querySelector('.encrypt-folder-toggle');
			const icon = header.querySelector('.encrypt-folder-icon');
			
			if (contents) {
				contents.style.display = "block";
				header.classList.remove("encrypt-folder-collapsed");
				if (toggle) setIcon(toggle as HTMLElement, "chevron-down");
				if (icon) setIcon(icon as HTMLElement, "folder-open");
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

		// 创建设置头部
		const headerEl = containerEl.createEl("div", { cls: "encrypt-settings-header" });
		const iconEl = headerEl.createEl("div", { cls: "encrypt-settings-icon" });
		setIcon(iconEl, "shield");
		headerEl.createEl("h2", { text: "EnDocMan Settings" });

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
			.setDesc("打开文档自动解密，关闭文档自动加密")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.autoEncryptionDecryption)
					.onChange(async (value) => {
						this.plugin.settings.autoEncryptionDecryption = value;
						await this.plugin.saveSettings();
					});
			});

		// 加密密钥设置
		new Setting(containerEl)
			.setName("加密密钥")
			.setDesc("设置 Encryption 加密的密钥（请妥善保管，丢失将无法解密文件）")
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
				text.inputEl.type = "password";
				text.setPlaceholder("输入密码")
					.setValue(this.password)
					.onChange(async (value) => {
						this.password = value;
					});
			})
			.addButton((button) =>
				button
					.setButtonText("生成密钥")
					.setCta()
					.onClick(async () => {
						if (!this.username?.trim() || !this.password?.trim()) {
							new Notice("未输入用户名或密码", 3000);
							return;
						}
						// 这里需要导入CryptoJS或使用其他加密方法
						// const randomKey = CryptoJS.lib.WordArray.random(32).toString();
						// this.plugin.settings.encryptionKey = 
						// 	CryptoJS.SHA256(this.username).toString().slice(0, 16) +
						// 	CryptoJS.SHA256(this.password).toString().slice(0, 64);
						
						// 临时使用简单的组合方式
						this.plugin.settings.encryptionKey = `${this.username}-${this.password}-${Date.now()}`;
						await this.plugin.saveSettings();
						this.display();
						new Notice("已生成新的加密密钥");
					})
			);

		// 安全提示
		const warningEl = containerEl.createEl("div", {
			cls: "encrypt-settings-warning",
		});
		
		const warningIcon = warningEl.createEl("div", {
			cls: "encrypt-settings-warning-icon",
		});
		setIcon(warningIcon, "alert-triangle");
		
		const warningContent = warningEl.createEl("div", {
			cls: "encrypt-settings-warning-content",
		});
		
		warningContent.createEl("h3", { text: "⚠️ 安全提示：" });
		const ul = warningContent.createEl("ul");
		ul.createEl("li", { text: "请务必备份您的加密密钥，丢失密钥将无法恢复加密文件" });
		ul.createEl("li", { text: "建议定期更换加密密钥以提高安全性" });
		ul.createEl("li", { text: "加密后的文件在 Obsidian 中将显示为加密内容" });
		ul.createEl("li", { text: "请确保在安全的环境中使用此插件" });
	}
}