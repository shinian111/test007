// 故障树应用类
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
        this.loadedNodes = new Map();
        this.imagePreloader = new Set();

        this.init();
    }

    async init() {
        // 使用内联JSON数据，避免外部文件依赖
        const mainData = await this.getMainData();
        this.buildTree(mainData, null);
        this.bindEvents();
    }

    // 获取主要数据
    async getMainData() {
        try {
            const response = await fetch('data/main.json');
            return await response.json();
        } catch (error) {
            console.error('加载主数据失败:', error);
            return this.getFallbackData();
        }
    }

    // 备用数据（当无法加载外部JSON时使用）
    getFallbackData() {
        return [
            {
                "title": "FTA-重点关注",
                "type": "folder",
                "source": "data/fta-focus.json"
            },
            {
                "title": "原材料",
                "type": "folder", 
                "source": "data/material-issues.json"
            },
            {
                "title": "工装/设备",
                "type": "folder",
                "source": "data/equipment-issues.json"
            },
            {
                "title": "设备",
                "type": "folder",
                "source": "data/equipment-issues.json"
            },
            {
                "title": "工装",
                "type": "folder",
                "source": "data/tooling-issues.json"
            },
            {
                "title": "高压阀",
                "type": "folder",
                "source": "data/high-pressure-valve.json"
            },
            {
                "title": "FailureMemory",
                "type": "folder",
                "source": "data/failure-memory.json"
            }
        ];
    }

    buildTree(data, parentElement, basePath = '') {
        const fragment = document.createDocumentFragment();

        data.forEach((item, index) => {
            const node = this.createTreeNode(item, basePath, index);
            fragment.appendChild(node);
        });

        if (parentElement) {
            parentElement.innerHTML = '';
            parentElement.appendChild(fragment);
        } else {
            this.treeContainer.appendChild(fragment);
        }
    }

    createTreeNode(item, basePath, key) {
        const li = document.createElement('div');
        li.className = 'tree-node';
        li.dataset.key = key;
        li.dataset.path = basePath;

        let hasChildren = false;
        if (item.type === 'folder') {
            hasChildren = true;
            if (item.children && item.children.length > 0) {
                li.classList.add('children');
            }
        }

        if (!hasChildren && item.type === 'page') {
            li.classList.add('leaf');
        }

        const iconSpan = document.createElement('span');
        iconSpan.className = 'icon';
        
        // 设置图标
        if (item.type === 'folder') {
            iconSpan.innerHTML = '<i class="fas fa-folder"></i>';
        } else {
            iconSpan.innerHTML = '<i class="fas fa-file-medical"></i>';
        }
        
        li.appendChild(iconSpan);

        const titleSpan = document.createElement('span');
        titleSpan.className = 'title';
        titleSpan.textContent = item.title;
        li.appendChild(titleSpan);

        li.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNode(li, item, basePath);
        });

        return li;
    }

    async selectNode(element, item, basePath) {
        document.querySelectorAll('.tree-node.active').forEach(n => n.classList.remove('active'));
        element.classList.add('active');

        this.currentPath = this.getBreadcrumbPath(element);
        this.updateInheritedNotes();
        this.renderBreadcrumb();

        if (item.type === 'page') {
            this.renderContent(item);
            this.preloadImagesInContent(item);
        } else {
            if (element.classList.contains('expanded')) {
                this.collapseNode(element);
            } else {
                await this.expandNode(element, item, basePath);
            }
        }
    }

    getBreadcrumbPath(element) {
        const path = [];
        let curr = element;
        while (curr && curr.classList.contains('tree-node')) {
            const title = curr.querySelector('.title').textContent;
            path.unshift({ title, element: curr });
            const parent = curr.parentElement.closest('.tree-node');
            if (parent && parent !== curr) {
                curr = parent;
            } else {
                break;
            }
        }
        return path;
    }

    renderBreadcrumb() {
        const parts = this.currentPath.map(p => p.title);
        this.breadcrumb.innerHTML = parts.length > 0 ? '路径: ' + parts.join(' > ') : '';
    }

    updateInheritedNotes() {
        const notes = [];
        let tempPath = [...this.currentPath];

        while (tempPath.length > 0) {
            const step = tempPath.shift();
            const el = step.element;
            const key = el.dataset.key;
            const path = el.dataset.path;
            const data = this.findItemByPathAndKey(path, key);
            if (data && data.notes) {
                notes.unshift(data.notes);
            }
        }

        if (notes.length > 0) {
            this.notesPanel.innerHTML = notes.map(n => `⚠️ ${n}`).join('<br>');
            this.notesPanel.classList.remove('hidden');
        } else {
            this.notesPanel.classList.add('hidden');
        }
    }

    async expandNode(parentNode, item, basePath) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-children';
        parentNode.parentNode.insertBefore(childrenContainer, parentNode.nextSibling);
        parentNode.dataset.container = 'true';
        parentNode.classList.add('expanded');

        let data = [];
        if (item.children) {
            data = item.children;
        } else if (item.source) {
            try {
                const response = await fetch(item.source);
                data = await response.json();
                this.loadedNodes.set(item.source, data);
            } catch (error) {
                console.error('加载子数据失败:', error);
                data = [];
            }
        }

        // 更新文件夹图标
        const icon = parentNode.querySelector('.icon i');
        icon.classList.remove('fa-folder');
        icon.classList.add('fa-folder-open');

        this.buildTree(data, childrenContainer, item.source || basePath);
    }

    collapseNode(parentNode) {
        const next = parentNode.nextSibling;
        if (next && next.classList.contains('tree-children')) {
            next.remove();
        }
        parentNode.classList.remove('expanded');
        
        // 更新文件夹图标
        const icon = parentNode.querySelector('.icon i');
        icon.classList.remove('fa-folder-open');
        icon.classList.add('fa-folder');
    }

    findItemByPathAndKey(jsonPath, key) {
        // 简化实现，直接使用主数据
        const mainData = this.getMainDataSync();
        return this.traverseToFind(mainData, parseInt(key));
    }

    getMainDataSync() {
        // 返回同步数据（简化实现）
        return this.getFallbackData();
    }

    traverseToFind(arr, key, depth = 0) {
        for (let i = 0; i < arr.length; i++) {
            if (i === key && depth === 0) return arr[i];
            if (arr[i].children) {
                const found = this.traverseToFind(arr[i].children, key, depth + 1);
                if (found) return found;
            }
        }
        return null;
    }

    renderContent(item) {
        let html = '';

        if (item.rootCause) {
            html += `<h3 class="info-header"><i class="fas fa-search"></i>根本原因</h3>
                    <div class="info-content">${item.rootCause}</div>`;
        }

        if (item.measures && item.measures.length > 0) {
            html += `<h3 class="info-header"><i class="fas fa-tools"></i>维修措施</h3>
                    <div class="info-content"><ul>`;
            item.measures.forEach(m => {
                html += `<li>${m}</li>`;
            });
            html += `</ul></div>`;
        }

        if (item.content) {
            html += `<div class="info-content">${item.content}</div>`;
        }

        this.contentArea.innerHTML = html || '<p class="placeholder">暂无内容。</p>';
    }

    preloadImagesInContent(item) {
        // 简化实现，实际项目中可以预加载图片
    }

    bindEvents() {
        this.searchInput.addEventListener('input', (e) => {
            this.filterTree(e.target.value.trim());
        });
    }

    filterTree(keyword) {
        if (!keyword) {
            document.querySelectorAll('.tree-children, .tree-node').forEach(el => {
                el.style.display = '';
            });
            this.noResults.style.display = 'none';
            return;
        }

        const allNodes = document.querySelectorAll('.tree-node');
        const matched = new Set();

        allNodes.forEach(node => {
            const title = node.querySelector('.title').textContent;
            if (title.toLowerCase().includes(keyword.toLowerCase())) {
                this.markNodeAndParents(node, matched);
            }
        });

        allNodes.forEach(node => {
            if (matched.has(node)) {
                node.style.display = '';
                const parentChildren = node.nextSibling;
                if (parentChildren && parentChildren.classList.contains('tree-children')) {
                    parentChildren.style.display = '';
                }
            } else {
                node.style.display = 'none';
                const children = node.nextSibling;
                if (children && children.classList.contains('tree-children')) {
                    children.style.display = 'none';
                }
            }
        });

        // 显示/隐藏无结果消息
        if (matched.size === 0) {
            this.noResults.style.display = 'block';
        } else {
            this.noResults.style.display = 'none';
        }
    }

    markNodeAndParents(node, set) {
        let curr = node;
        while (curr) {
            set.add(curr);
            const parentLi = curr.parentElement.closest('.tree-node');
            if (parentLi) {
                curr = parentLi;
            } else {
                break;
            }
        }
    }

    showError(msg) {
        this.contentArea.innerHTML = `<p style="color:#f48484;">❌❌ ${msg}</p>`;
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    new FaultTreeApp();
});
