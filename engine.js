
export class ArchitectureSimulator {
    constructor(config) {
        this.config = config;
        this.state = {
            scale: 0.55,
            pX: -100,
            pY: -50,
            isDraggingCanvas: false,
            isDraggingNode: false,
            activeNode: null,
            dragStartX: 0,
            dragStartY: 0,
            nodeStartX: 0,
            nodeStartY: 0,
            simulationActive: false,
            activeLayers: new Set(config.layers.filter(l => l.active).map(l => l.id))
        };

        this.els = {
            wrapper: document.getElementById('wrapper'),
            canvas: document.getElementById('canvas'),
            svg: document.getElementById('svgLayer'),
            tooltip: document.getElementById('lineTooltip'),
            inspector: document.getElementById('inspector'),
            packet: document.getElementById('packet'),
            simButtons: document.getElementById('simButtons'),
            layerFilters: document.getElementById('layerFilters'),
            nodeSearch: document.getElementById('nodeSearch'),
            inspContent: document.getElementById('insp-content'),
            inspTitle: document.getElementById('insp-title'),
            inspRole: document.getElementById('insp-role')
        };

        this.init();
    }

    init() {
        this.applyTheme();
        this.renderUI();
        this.renderCanvas();
        this.renderLines();
        this.setupInteractions();
        this.updateTransform();
    }

    applyTheme() {
        const root = document.documentElement;
        for (const [key, value] of Object.entries(this.config.theme.colors)) {
            root.style.setProperty(`--${key}`, value);
        }
    }

    renderUI() {
        // Render Simulation Buttons
        this.els.simButtons.innerHTML = this.config.simulations.map(sim => `
            <button class="sim-btn" data-sim="${sim.id}">
                <span><strong>${sim.label.split('(')[0]}</strong> (${sim.label.split('(')[1] || ''}</span> 
                <i class="${sim.icon}"></i>
            </button>
        `).join('');

        this.els.simButtons.querySelectorAll('.sim-btn').forEach(btn => {
            btn.addEventListener('click', () => this.runSimulation(btn.dataset.sim));
        });

        // Render Layer Filters
        // Group 1: Core Layers (non-infra)
        const coreLayers = this.config.layers.filter(l => !l.group);
        const infraLayers = this.config.layers.filter(l => l.group === 'infra');

        let html = `<div class="section-title"><span><i class="fas fa-layer-group"></i> Core Layers</span></div>
                    <div class="filter-grid" style="margin-bottom: 15px;">
                        <button class="filter-btn active" id="resetLayers" style="grid-column: span 2; justify-content: center; font-weight:bold; border-color: white;">Reset Layers</button>`;
        
        html += coreLayers.map(l => `
            <button class="filter-btn active" data-layer="${l.id}">
                <span class="dot" style="background:${l.color}"></span> ${l.label}
            </button>
        `).join('');
        html += `</div>`;

        if (infraLayers.length > 0) {
            html += `<div class="section-title"><span><i class="fas fa-server"></i> Infrastructure Layers</span></div>
                     <div class="filter-grid">`;
            html += infraLayers.map(l => `
                <button class="filter-btn active" data-layer="${l.id}">
                    <span class="dot" style="background:${l.color}"></span> ${l.label}
                </button>
            `).join('');
            html += `</div>`;
        }

        this.els.layerFilters.innerHTML = html;

        // Bind Filter Events
        this.els.layerFilters.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (btn.id === 'resetLayers') {
                    this.resetLayers();
                } else {
                    this.toggleLayer(btn.dataset.layer, btn);
                }
            });
        });

        // Search
        this.els.nodeSearch.addEventListener('keyup', () => this.filterNodes());
    }

    renderCanvas() {
        // Render Sites
        this.config.sites.forEach(site => {
            const el = document.createElement('div');
            el.className = 'site-group';
            el.id = site.id;
            el.style.left = `${site.x}px`;
            el.style.top = `${site.y}px`;
            el.style.width = `${site.w}px`;
            el.style.height = `${site.h}px`;
            el.innerHTML = `<div class="site-label">${site.label}</div>`;
            this.els.canvas.appendChild(el);
        });

        // Render Nodes
        this.config.nodes.forEach(node => {
            const el = document.createElement('div');
            const typeDef = this.config.nodeTypes[node.type] || {};
            
            el.className = `node ${node.type}`;
            el.id = node.id;
            el.style.left = `${node.x}px`;
            el.style.top = `${node.y}px`;
            
            // Apply type-based styles if defined
            if (typeDef.style) {
                if (typeDef.style === 'dashed') el.style.borderStyle = 'dashed';
                if (typeDef.style === 'border-left') el.style.borderLeft = `3px solid ${typeDef.iconColor || 'var(--c-radius)'}`;
            }

            // Handle custom icon styling
            let iconStyle = '';
            const iconColor = node.iconColor || typeDef.iconColor;
            const iconBg = node.iconBg || typeDef.iconBg;
            
            if (iconColor) iconStyle += `color: ${iconColor}; background: white;`;
            if (iconBg) iconStyle += `background: ${iconBg}; color: ${iconColor ? iconColor : 'white'};`;
            if (typeDef.iconBg && !iconBg) iconStyle += `background: ${typeDef.iconBg};`;

            // Header styling
            let headerStyle = '';
            if (typeDef.headerBg) headerStyle += `background: ${typeDef.headerBg};`;
            if (typeDef.headerColor) headerStyle += `color: ${typeDef.headerColor};`;

            // Icon Content
            const iconVal = node.icon || typeDef.icon || '';
            const iconContent = iconVal.includes('fa-') ? `<i class="${iconVal}"></i>` : iconVal;

            el.innerHTML = `
                <div class="node-header" style="${headerStyle}">
                    <div class="node-icon" style="${iconStyle}">${iconContent}</div> ${node.label}
                </div>
                <div class="node-body">
                    ${node.sub}<br />
                    ${node.tag ? `<span class="tag ${node.tagClass || ''}">${node.tag}</span>` : ''}
                </div>
            `;
            this.els.canvas.appendChild(el);
        });
    }

    renderLines() {
        // Define Markers
        let defs = `<defs>`;
        
        this.config.layers.forEach(layer => {
             defs += `
              <marker id="m-${layer.id}" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                <path d="M0,0 L0,6 L9,3 z" fill="${layer.color}" />
              </marker>`;
        });
        defs += `</defs>`;
        this.els.svg.innerHTML = defs;

        // Render Connections
        this.config.connections.forEach((conn, i) => {
            const n1 = document.getElementById(conn.from);
            const n2 = document.getElementById(conn.to);
            if (!n1 || !n2) return;

            // Infer color from layer definition if not explicit
            const layerDef = this.config.layers.find(l => l.id === conn.type);
            const color = conn.color || (layerDef ? layerDef.color : '#fff');

            const p1 = this.getNodeCenter(n1);
            const p2 = this.getNodeCenter(n2);

            const isHoriz = Math.abs(p1.x - p2.x) > Math.abs(p1.y - p2.y);
            const curve = conn.curve || 0;
            const cp1 = isHoriz ? {x: p1.x + (p2.x - p1.x) / 2, y: p1.y + curve} : {x: p1.x + curve, y: p1.y + (p2.y - p1.y) / 2};
            const cp2 = isHoriz ? {x: p1.x + (p2.x - p1.x) / 2, y: p2.y + curve} : {x: p2.x + curve, y: p1.y + (p2.y - p1.y) / 2};

            const d = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;

            // Visual Path
            const pathVis = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathVis.setAttribute('d', d);
            pathVis.setAttribute('stroke', color);
            
            let classes = `conn-line layer-${conn.type}`;
            if (conn.isWan) classes += ' layer-wan';
            
            pathVis.setAttribute('class', classes);
            pathVis.setAttribute('id', `path-vis-${i}`);
            pathVis.setAttribute('data-from', conn.from);
            pathVis.setAttribute('data-to', conn.to);

            if (conn.dash) pathVis.setAttribute('stroke-dasharray', '8,4');
            pathVis.setAttribute('marker-end', `url(#m-${conn.type})`);

            // Hitbox Path
            const pathHit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathHit.setAttribute('d', d);
            let hitClasses = `conn-hitbox layer-${conn.type}`;
            if (conn.isWan) hitClasses += ' layer-wan';
            pathHit.setAttribute('class', hitClasses);

            // Events
            // Pass the resolved color to the inspector
            const connWithColor = { ...conn, color: color };
            pathHit.addEventListener('click', (e) => { e.stopPropagation(); this.inspectConn(connWithColor); });
            pathHit.addEventListener('mouseenter', (e) => {
                pathVis.classList.add('hovered');
                this.showTooltip(e, connWithColor);
            });
            pathHit.addEventListener('mouseleave', () => {
                pathVis.classList.remove('hovered');
                this.els.tooltip.classList.remove('visible');
            });

            this.els.svg.appendChild(pathVis);
            this.els.svg.appendChild(pathHit);
        });
        
        // Re-apply filters
        this.applyFilters();
    }

    setupInteractions() {
        // Drag Canvas
        this.els.wrapper.addEventListener('mousedown', e => {
            if (e.target.closest('.node') || e.target.closest('.conn-hitbox')) return;
            this.state.isDraggingCanvas = true;
            this.state.dragStartX = e.clientX - this.state.pX;
            this.state.dragStartY = e.clientY - this.state.pY;
            this.els.wrapper.style.cursor = 'grabbing';
        });

        // Drag Node
        document.querySelectorAll('.node').forEach(node => {
            node.addEventListener('mousedown', e => {
                e.stopPropagation();
                this.state.isDraggingNode = true;
                this.state.activeNode = node;
                this.state.dragStartX = e.clientX;
                this.state.dragStartY = e.clientY;
                this.state.nodeStartX = parseInt(node.style.left || 0);
                this.state.nodeStartY = parseInt(node.style.top || 0);
                node.style.zIndex = 1000;
                this.closeInspector();
            });

            node.addEventListener('click', (e) => {
                if (Math.abs(e.clientX - this.state.dragStartX) < 5) this.inspectNode(node);
            });
        });

        window.addEventListener('mousemove', e => {
            if (this.state.isDraggingCanvas) {
                this.state.pX = e.clientX - this.state.dragStartX;
                this.state.pY = e.clientY - this.state.dragStartY;
                this.updateTransform();
            } else if (this.state.isDraggingNode && this.state.activeNode) {
                const dx = (e.clientX - this.state.dragStartX) / this.state.scale;
                const dy = (e.clientY - this.state.dragStartY) / this.state.scale;
                this.state.activeNode.style.left = `${this.state.nodeStartX + dx}px`;
                this.state.activeNode.style.top = `${this.state.nodeStartY + dy}px`;
                requestAnimationFrame(() => this.renderLines());
            }
        });

        window.addEventListener('mouseup', () => {
            this.state.isDraggingCanvas = false;
            this.state.isDraggingNode = false;
            if (this.state.activeNode) {
                this.state.activeNode.style.zIndex = '';
                this.state.activeNode = null;
            }
            this.els.wrapper.style.cursor = 'grab';
        });

        this.els.wrapper.addEventListener('wheel', e => {
            e.preventDefault();
            this.state.scale = Math.min(Math.max(0.2, this.state.scale - e.deltaY * 0.001), 3);
            this.updateTransform();
        });
        
        // Close Inspector
        document.getElementById('closeInspector').addEventListener('click', () => this.closeInspector());
    }

    updateTransform() {
        this.els.canvas.style.transform = `translate(${this.state.pX}px, ${this.state.pY}px) scale(${this.state.scale})`;
    }

    getNodeCenter(el) {
        return {
            x: parseInt(el.style.left) + el.offsetWidth / 2,
            y: parseInt(el.style.top) + el.offsetHeight / 2
        };
    }

    // --- Logic ---

    toggleLayer(layerId, btn) {
        if (this.state.activeLayers.has(layerId)) {
            this.state.activeLayers.delete(layerId);
            btn.classList.remove('active');
        } else {
            this.state.activeLayers.add(layerId);
            btn.classList.add('active');
        }
        this.applyFilters();
    }

    resetLayers() {
        this.state.activeLayers = new Set(this.config.layers.map(l => l.id));
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.add('active'));
        this.applyFilters();
    }

    applyFilters() {
        const allLines = document.querySelectorAll('.conn-line, .conn-hitbox');
        allLines.forEach(line => {
            const lineLayers = Array.from(line.classList)
                .filter(c => c.startsWith('layer-'))
                .map(c => c.replace('layer-', ''));
            
            const isVisible = lineLayers.every(layer => this.state.activeLayers.has(layer));
            if (isVisible) line.classList.remove('hidden');
            else line.classList.add('hidden');
        });
    }

    filterNodes() {
        const term = this.els.nodeSearch.value.toLowerCase();
        document.querySelectorAll('.node').forEach(n => {
            const txt = n.innerText.toLowerCase();
            if (term.length > 2 && txt.includes(term)) {
                n.classList.add('highlighted');
                // Auto pan to first match
                if (!this.state.found) {
                    this.state.pX = -parseInt(n.style.left) + window.innerWidth / 2 - 100;
                    this.state.pY = -parseInt(n.style.top) + window.innerHeight / 2 - 50;
                    this.updateTransform();
                    this.state.found = true;
                }
            } else n.classList.remove('highlighted');
        });
        this.state.found = false;
    }

    // --- Inspector ---
    inspectNode(nodeEl) {
        // Find node config
        const nodeData = this.config.nodes.find(n => n.id === nodeEl.id);
        if (!nodeData) return;

        const doc = this.config.documentation[nodeData.type];
        if (!doc) return;

        let html = '';
        doc.blocks.forEach(b => {
            html += `<div class="tech-block"><div class="tech-title">${b.title}</div><div class="tech-content">${b.content}</div></div>`;
        });

        this.els.inspTitle.innerText = nodeData.label;
        this.els.inspRole.innerText = doc.role;
        this.els.inspContent.innerHTML = html;
        this.els.inspector.classList.add('open');
    }

    inspectConn(conn) {
        this.els.inspTitle.innerText = conn.label;
        this.els.inspRole.innerText = "Connection Detail";
        this.els.inspContent.innerHTML = `
            <div class="tech-block">
                <div class="tech-title" style="color:${conn.color}">Technical Specification</div>
                <div class="tech-content">${conn.detail}</div>
            </div>`;
        this.els.inspector.classList.add('open');
    }

    closeInspector() {
        this.els.inspector.classList.remove('open');
    }

    showTooltip(e, conn) {
        this.els.tooltip.querySelector('h4').innerText = conn.label;
        this.els.tooltip.querySelector('#ttBody').innerHTML = conn.detail;
        this.els.tooltip.classList.add('visible');
        this.els.tooltip.style.left = (e.clientX + 15) + 'px';
        this.els.tooltip.style.top = (e.clientY + 15) + 'px';
    }

    // --- Simulation ---
    runSimulation(simId) {
        const sim = this.config.simulations.find(s => s.id === simId);
        if (!sim) return;

        document.querySelectorAll('.active-flow').forEach(p => p.classList.remove('active-flow'));
        document.querySelectorAll('.highlighted').forEach(n => n.classList.remove('highlighted'));
        this.state.simulationActive = true;

        this.animateSequence(sim.nodes);
    }

    async animateSequence(nodes) {
        for (let i = 0; i < nodes.length - 1; i++) {
            const from = nodes[i];
            const to = nodes[i + 1];
            document.getElementById(from).classList.add('highlighted');
            document.getElementById(to).classList.add('highlighted');

            const paths = Array.from(document.querySelectorAll('.conn-line'));
            const pathEl = paths.find(p =>
                (p.getAttribute('data-from') == from && p.getAttribute('data-to') == to) ||
                (p.getAttribute('data-from') == to && p.getAttribute('data-to') == from)
            );

            if (pathEl && !pathEl.classList.contains('hidden')) {
                pathEl.classList.add('active-flow');
                await this.movePacket(pathEl, from, to);
            }
        }
        setTimeout(() => {
            document.querySelectorAll('.highlighted').forEach(n => n.classList.remove('highlighted'));
            document.querySelectorAll('.active-flow').forEach(p => p.classList.remove('active-flow'));
            this.els.packet.style.display = 'none';
        }, 2000);
    }

    movePacket(pathEl, fromId, toId) {
        return new Promise(resolve => {
            this.els.packet.style.display = 'block';
            const len = pathEl.getTotalLength();
            const pStart = pathEl.getPointAtLength(0);
            const nStart = this.getNodeCenter(document.getElementById(fromId));
            const distStart = Math.hypot(pStart.x - nStart.x, pStart.y - nStart.y);
            const reverse = distStart > 50;

            let progress = 0;
            const animate = () => {
                progress += 0.02;
                if (progress >= 1) { resolve(); return; }
                const point = pathEl.getPointAtLength(reverse ? len * (1 - progress) : len * progress);
                this.els.packet.style.left = (point.x - 6) + 'px';
                this.els.packet.style.top = (point.y - 6) + 'px';
                requestAnimationFrame(animate);
            };
            animate();
        });
    }
}
