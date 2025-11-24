// 故障树应用类 - 支持复杂层级结构
class FaultTreeApp {
    constructor() {
        this.treeContainer = document.getElementById('treeContainer');
        this.contentArea = document.getElementById('contentArea');
        this.notesPanel = document.getElementById('notesPanel');
        this.searchInput = document.getElementById('searchInput');
        this.breadcrumb = document.getElementById('breadcrumb');
        this.noResults = document.getElementById('noResults');

        this.currentPath = [];
        this.globalNotes = [];
        this.loadedNodes = new Map(); // 缓存已加载的节点数据
        this.imagePreloader = new Set();
        this.basePath = 'data/'; // 数据文件的基础路径

        this.init();
    }

    async init() {
        try {
            const mainData = await this.loadData('main.json');
            this.buildTree(mainData, this.treeContainer);
            this.bindEvents();
        } catch (error) {
            console.error('初始化失败:', error);
            this.showError('系统初始化失败，请刷新页面重试');
        }
    }

    // 加载JSON数据
    async loadData(filename) {
        const cacheKey = this.basePath + filename;
        
        // 检查缓存
        if (this.loadedNodes.has(cacheKey)) {
            return this.loadedNodes.get(cacheKey);
        }
        
        try {
            const response = await fetch(cacheKey);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            this.loadedNodes.set(cacheKey, data);
            return data;
        } catch (error) {
            console.error(`加载数据文件失败: ${filename}`, error);
            throw error;
        }
    }

    // 构建树形结构
    buildTree(data, container, level = 0) {
        if (!data || !Array.isArray(data)) {
            console.warn('无效的数据格式:', data);
            return;
        }

        const fragment = document.createDocumentFragment();

        data.forEach((item, index) => {
            const nodeElement = this.createTreeNode(item, index, level);
            fragment.appendChild(nodeElement);
        });

        if (container) {
            // 清空容器并添加新内容
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
            container.appendChild(fragment);
        }
    }

    // 创建树节点
    createTreeNode(item, key, level = 0) {
        const li = document.createElement('div');
        li.className = 'tree-node';
        li.dataset.key = key;
        li.dataset.level = level;
        li.style.paddingLeft = `${level * 20}px`; // 根据层级缩进

        // 存储完整数据引用
        li.dataset.itemData = JSON.stringify(item);

        const iconSpan = document.createElement('span');
        iconSpan.className = 'icon';
        
        // 设置图标
        if (item.type === 'folder') {
            iconSpan.innerHTML = '<i class="fas fa-folder"></i>';
            li.classList.add('folder-node');
        } else {
            iconSpan.innerHTML = '<i class="fas fa-file-medical"></i>';
            li.classList.add('leaf-node');
        }
        
        li.appendChild(iconSpan);

        const titleSpan = document.createElement('span');
        titleSpan.className = 'title';
        titleSpan.textContent = item.title || '未命名节点';
        li.appendChild(titleSpan);

        // 添加点击事件
        li.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleNodeClick(li, item);
        });

        return li;
    }

    // 处理节点点击
    async handleNodeClick(nodeElement, itemData) {
        // 移除其他节点的激活状态
        document.querySelectorAll('.tree-node.active').forEach(n => {
            n.classList.remove('active');
        });
        
        // 激活当前节点
        nodeElement.classList.add('active');

        // 更新面包屑
        this.updateBreadcrumb(nodeElement, itemData);

        if (itemData.type === 'folder') {
            // 处理文件夹节点
            await this.toggleFolder(nodeElement, itemData);
        } else {
            // 处理页面节点
            this.displayContent(itemData);
        }
    }

    // 切换文件夹展开/折叠
    async toggleFolder(nodeElement, itemData) {
        const isExpanded = nodeElement.classList.contains('expanded');
        const icon = nodeElement.querySelector('.icon i');
        
        if (isExpanded) {
            // 折叠文件夹
            this.collapseFolder(nodeElement);
            icon.classList.remove('fa-folder-open');
            icon.classList.add('fa-folder');
        } else {
            // 展开文件夹
            await this.expandFolder(nodeElement, itemData);
            icon.classList.remove('fa-folder');
            icon.classList.add('fa-folder-open');
        }
    }

    // 展开文件夹
    async expandFolder(nodeElement, itemData) {
        // 检查是否已经有子容器
        let childrenContainer = nodeElement.nextElementSibling;
        if (childrenContainer && childrenContainer.classList.contains('tree-children')) {
            // 已经展开，直接显示
            childrenContainer.style.display = 'block';
            nodeElement.classList.add('expanded');
            return;
        }

        // 创建子容器
        childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-children';
        childrenContainer.style.display = 'block';
        
        // 插入到当前节点后面
        nodeElement.parentNode.insertBefore(childrenContainer, nodeElement.nextSibling);
        nodeElement.classList.add('expanded');

        // 加载子数据
        let childrenData = [];
        
        if (itemData.children && itemData.children.length > 0) {
            // 使用内联的子数据
            childrenData = itemData.children;
        } else if (itemData.source) {
            // 从外部文件加载子数据
            try {
                childrenData = await this.loadData(itemData.source);
            } catch (error) {
                console.error('加载子数据失败:', error);
                childrenContainer.innerHTML = '<div class="error-message">加载数据失败</div>';
                return;
            }
        }

        // 构建子树
        if (childrenData.length > 0) {
            this.buildTree(childrenData, childrenContainer, parseInt(nodeElement.dataset.level) + 1);
        } else {
            childrenContainer.innerHTML = '<div class="empty-message">空文件夹</div>';
        }
    }

    // 折叠文件夹
    collapseFolder(nodeElement) {
        const childrenContainer = nodeElement.nextElementSibling;
        if (childrenContainer && childrenContainer.classList.contains('tree-children')) {
            childrenContainer.style.display = 'none';
        }
        nodeElement.classList.remove('expanded');
    }

    // 更新面包屑导航
    updateBreadcrumb(nodeElement, itemData) {
        const path = [];
        let currentNode = nodeElement;
        
        // 收集路径上的所有节点
        while (currentNode && currentNode.classList.contains('tree-node')) {
            try {
                const itemData = JSON.parse(currentNode.dataset.itemData);
                path.unshift(itemData.title);
            } catch (e) {
                path.unshift('未知节点');
            }
            
            // 查找父节点
            const parentContainer = currentNode.parentElement;
            if (parentContainer && parentContainer.classList.contains('tree-children')) {
                currentNode = parentContainer.previousElementSibling;
            } else {
                break;
            }
        }
        
        this.breadcrumb.innerHTML = path.length > 0 ? '路径: ' + path.join(' > ') : '';
    }

    // 显示内容
    displayContent(itemData) {
        let html = '';

        if (itemData.rootCause) {
            html += `<h3 class="info-header"><i class="fas fa-search"></i>根本原因</h3>
                    <div class="info-content">${this.formatText(itemData.rootCause)}</div>`;
        }

        if (itemData.measures && itemData.measures.length > 0) {
            html += `<h3 class="info-header"><i class="fas fa-tools"></i>维修措施</h3>
                    <div class="info-content"><ul>`;
            itemData.measures.forEach(m => {
                html += `<li>${this.formatText(m)}</li>`;
            });
            html += `</ul></div>`;
        }

        if (itemData.content) {
            html += `<div class="info-content">${this.formatText(itemData.content)}</div>`;
        }

        // 处理图片
        if (itemData.images && Array.isArray(itemData.images)) {
            itemData.images.forEach(img => {
                html += `<div class="image-container"></div>`;
            });
        }

        this.contentArea.innerHTML = html || '<p class="placeholder">暂无内容。</p>';
        
        // 预加载图片
        this.preloadImages(itemData);
    }

    // 格式化文本（处理换行等）
    formatText(text) {
        if (!text) return '';
        return text.replace(/\n/g, '<br>');
    }

    // 预加载图片
    preloadImages(itemData) {
        // 简化实现，实际项目中可以预加载图片
    }

    // 绑定事件
    bindEvents() {
        // 搜索功能
        this.searchInput.addEventListener('input', (e) => {
            this.filterTree(e.target.value.trim());
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.searchInput.value = '';
                this.filterTree('');
            }
        });
    }

    // 过滤树节点
    filterTree(keyword) {
        const allNodes = document.querySelectorAll('.tree-node');
        const treeContainers = document.querySelectorAll('.tree-children');
        let hasMatches = false;

        if (!keyword) {
            // 显示所有节点和容器
            allNodes.forEach(node => node.style.display = '');
            treeContainers.forEach(container => container.style.display = '');
            this.noResults.style.display = 'none';
            return;
        }

        const lowerKeyword = keyword.toLowerCase();

        allNodes.forEach(node => {
            const title = node.querySelector('.title').textContent.toLowerCase();
            const isMatch = title.includes(lowerKeyword);
            
            if (isMatch) {
                node.style.display = '';
                hasMatches = true;
                
                // 显示所有父级容器
                this.showParentContainers(node);
            } else {
                node.style.display = 'none';
            }
        });

        // 显示/隐藏无结果消息
        if (hasMatches) {
            this.noResults.style.display = 'none';
        } else {
            this.noResults.style.display = 'block';
        }
    }

    // 显示父级容器
    showParentContainers(node) {
        let parentContainer = node.parentElement;
        while (parentContainer) {
            if (parentContainer.classList.contains('tree-children')) {
                parentContainer.style.display = 'block';
                
                // 显示父节点
                const parentNode = parentContainer.previousElementSibling;
                if (parentNode && parentNode.classList.contains('tree-node')) {
                    parentNode.style.display = '';
                    parentNode.classList.add('expanded');
                    
                    // 更新图标
                    const icon = parentNode.querySelector('.icon i');
                    if (icon) {
                        icon.classList.remove('fa-folder');
                        icon.classList.add('fa-folder-open');
                    }
                }
                
                // 继续向上查找
                parentContainer = parentContainer.parentElement;
            } else {
                break;
            }
        }
    }

    // 显示错误信息
    showError(message) {
        this.contentArea.innerHTML = `<div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${message}</p>
        </div>`;
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    new FaultTreeApp();
});
