export class ArchitectureSimulator {
	// =========================================================================
	// 1. SETUP & INITIALIZATION
	// =========================================================================
	constructor(config) {
		this.config = config;

		// State Container
		this.state = {
			scale: 0.6,
			pX: -50,
			pY: -50,
			isDraggingCanvas: false,
			isDraggingNode: false,
			activeNode: null,
			dragStartX: 0,
			dragStartY: 0,
			nodeStartX: 0,
			nodeStartY: 0,
			simulationActive: false,
			found: false,
			activeLayers: new Set(
				(config.protocols || []).filter((l) => l.active).map((l) => l.id),
			),
		};

		// DOM Element Cache
		this.els = {
			wrapper: document.getElementById("wrapper"),
			canvas: document.getElementById("canvas"),
			svg: document.getElementById("svgLayer"),
			tooltip: document.getElementById("lineTooltip"),
			inspector: document.getElementById("inspector"),
			packet: document.getElementById("packet"),
			simButtons: document.getElementById("simButtons"),
			layerFilters: document.getElementById("layerFiltersPanel"),
			nodeSearch: document.getElementById("nodeSearch"),
			inspContent: document.getElementById("insp-content"),
			inspTitle: document.getElementById("insp-title"),
			inspRole: document.getElementById("insp-role"),
		};

		this.init();
	}

	init() {
		this.applyTheme();

		// CRITICAL FIX: Ensure math aligns with CSS transforms
		if (this.els.canvas) {
			this.els.canvas.style.transformOrigin = "0 0";
		}

		this.renderUI();
		this.renderCanvas();
		this.renderLines();
		this.setupInteractions();
		this.updateTransform();
		this.collapseDefaultPanels();
	}

	applyTheme() {
		const root = document.documentElement;
		if (!this.config.theme?.colors) return;
		for (const [key, value] of Object.entries(this.config.theme.colors)) {
			root.style.setProperty(`--${key}`, value);
		}
	}

	collapseDefaultPanels() {
		["simButtons", "layerFiltersContent"].forEach((target) => {
			const title = document.querySelector(
				`.section-title[data-target="${target}"]`,
			);
			const panel = document.getElementById(target);
			if (title && panel) {
				title.classList.add("collapsed");
				panel.classList.add("collapsed");
			}
		});
	}

	// =========================================================================
	// 2. UI & SIDEBAR RENDERING
	// =========================================================================
	renderUI() {
		this._renderSimButtons();
		this._renderLayerFilters();
		this._bindSearch();
	}

	_renderSimButtons() {
		if (!this.els.simButtons) return;
		this.els.simButtons.innerHTML = this.config.simulations
			.map(
				(sim) => `
            <button class="sim-btn" data-sim="${sim.id}">
                <span><strong>${sim.label.split("(")[0]}</strong> (${
					sim.label.split("(")[1] || ""
				}</span> 
                <i class="${sim.icon}"></i>
            </button>
        `,
			)
			.join("");

		this.els.simButtons.querySelectorAll(".sim-btn").forEach((btn) => {
			btn.addEventListener("click", () => this.runSimulation(btn.dataset.sim));
		});
	}

	_renderLayerFilters() {
		const protocols = this.config.protocols || [];
		const coreLayers = protocols.filter((l) => !l.group);
		const infraLayers = protocols.filter((l) => l.group === "infra");

		const buildBtn = (l) => `
            <button class="filter-btn active" data-layer="${l.id}" title="${l.detail || l.label}">
                <span class="dot" style="background:${l.color}"></span> ${l.label}
            </button>`;

		let html = `
            <div class="section-title" data-target="layerFiltersContent">
                <span><i class="fas fa-layer-group"></i> Core Protocols</span>
                <i class="fas fa-chevron-down toggle-icon"></i>
            </div>
            <div class="panel-content" id="layerFiltersContent">
                <div class="filter-grid" style="margin-bottom: 15px;">
                    ${coreLayers.map(buildBtn).join("")}
                </div>`;

		if (infraLayers.length > 0) {
			html += `
                <div class="section-title" style="margin-top: 15px; font-size: 0.65rem; color: var(--text-mute); text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">
                    <span><i class="fas fa-server"></i> Infrastructure Protocols</span>
                </div>
                <div class="filter-grid">
                    ${infraLayers.map(buildBtn).join("")}
                </div>`;
		}
		html += `</div>`; // Close panel-content

		if (!this.els.layerFilters) return;
		this.els.layerFilters.innerHTML = html;

		// Bind Filter Interactions
		this.els.layerFilters.querySelectorAll(".filter-btn").forEach((btn) => {
			btn.addEventListener("click", () =>
				this.toggleLayer(btn.dataset.layer, btn),
			);
			btn.addEventListener("mouseenter", () =>
				this.highlightSingleProtocol(btn.dataset.layer),
			);
			btn.addEventListener("mouseleave", () => this.clearHoverProtocols());
		});

		// Bind Accordion Toggles
		document.querySelectorAll(".section-title").forEach((title) => {
			if (title.dataset.target) {
				title.addEventListener("click", () => {
					const content = document.getElementById(title.dataset.target);
					if (content) {
						content.classList.toggle("collapsed");
						title.classList.toggle("collapsed");
					}
				});
			}
		});
	}

	_bindSearch() {
		if (this.els.nodeSearch) {
			this.els.nodeSearch.addEventListener("keyup", () => this.filterNodes());
		}
	}

	// =========================================================================
	// 3. CANVAS RENDERING (NODES & LINES)
	// =========================================================================
	renderCanvas() {
		this._renderSites();
		this._renderNodes();
	}

	_renderSites() {
		this.config.sites.forEach((site) => {
			const el = document.createElement("div");
			el.className = "site-group";
			el.id = site.id;
			Object.assign(el.style, {
				left: `${site.x}px`,
				top: `${site.y}px`,
				width: `${site.w}px`,
				height: `${site.h}px`,
			});
			el.innerHTML = `<div class="site-label">${site.label}</div>`;
			this.els.canvas.appendChild(el);
		});
	}

	_renderNodes() {
		this.config.nodes.forEach((node) => {
			const typeDef = this.config.nodeTypes[node.type] || {};
			const el = document.createElement("div");

			el.className = `node ${node.type}`;
			el.id = node.id;
			el.style.left = `${node.x}px`;
			el.style.top = `${node.y}px`;

			// Node Styling Logic
			if (typeDef.style === "dashed") el.style.borderStyle = "dashed";
			if (typeDef.style === "border-left")
				el.style.borderLeft = `3px solid ${typeDef.iconColor || "var(--c-radius)"}`;

			const iconColor = node.iconColor || typeDef.iconColor;
			const iconBg = node.iconBg || typeDef.iconBg;

			let iconStyle = "";
			if (iconColor) iconStyle += `color: ${iconColor}; background: white;`;
			if (iconBg) iconStyle += `background: ${iconBg}; color: ${iconColor || "white"};`;
			if (typeDef.iconBg && !iconBg) iconStyle += `background: ${typeDef.iconBg};`;

			let headerStyle = "";
			if (typeDef.headerBg) headerStyle += `background: ${typeDef.headerBg};`;
			if (typeDef.headerColor) headerStyle += `color: ${typeDef.headerColor};`;

			const iconVal = node.icon || typeDef.icon || "";
			const iconContent = iconVal.includes("fa-")
				? `<i class="${iconVal}"></i>`
				: iconVal;

			el.innerHTML = `
                <div class="node-header" style="${headerStyle}">
                    <div class="node-icon" style="${iconStyle}">${iconContent}</div> ${node.label}
                </div>
                <div class="node-body">
                    ${node.sub}<br />
                    ${node.tag ? `<span class="tag ${node.tagClass || ""}">${node.tag}</span>` : ""}
                </div>
            `;
			this.els.canvas.appendChild(el);
		});
	}

	renderLines() {
		// 1. Define SVG Markers
		const markers = (this.config.protocols || [])
			.map(
				(l) => `
            <marker id="m-${l.id}" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L6,3 L0,6 z" fill="${l.color}" />
            </marker>
        `,
			)
			.join("");
		this.els.svg.innerHTML = `<defs>${markers}</defs>`;

		// 2. Calculate Grouping for Curves
		const pairMap = new Map();
		this.config.connections.forEach((conn) => {
			const key = [conn.from, conn.to].sort().join("|");
			if (!pairMap.has(key)) pairMap.set(key, []);
			pairMap.get(key).push(conn);
		});

		// 3. Draw Lines
		this.config.connections.forEach((conn, i) => {
			const n1 = document.getElementById(conn.from);
			const n2 = document.getElementById(conn.to);
			if (!n1 || !n2) return;

			const layerDef = (this.config.protocols || []).find(
				(l) => l.id === conn.type,
			);
			const color = conn.color || (layerDef ? layerDef.color : "#fff");

			// Calculate geometry
			const c1 = this.getNodeCenter(n1);
			const c2 = this.getNodeCenter(n2);
			const p1 = this.getNodeEdgePoint(n1, c2);
			const p2 = this.getNodeEdgePoint(n2, c1);

			let curve = conn.curve || 0;
			// Auto-offset if multiple lines exist between nodes
			const group = pairMap.get([conn.from, conn.to].sort().join("|")) || [];
			if (!conn.curve && group.length > 1) {
				const idx = group.indexOf(conn);
				curve = (idx - (group.length - 1) / 2) * 20;
			}

			// Bezier Control Points
			const isHoriz = Math.abs(p1.x - p2.x) > Math.abs(p1.y - p2.y);
			const cp1 = isHoriz
				? { x: p1.x + (p2.x - p1.x) / 2, y: p1.y + curve }
				: { x: p1.x + curve, y: p1.y + (p2.y - p1.y) / 2 };
			const cp2 = isHoriz
				? { x: p1.x + (p2.x - p1.x) / 2, y: p2.y + curve }
				: { x: p2.x + curve, y: p1.y + (p2.y - p1.y) / 2 };

			const d = `M ${p1.x} ${p1.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
			const connId = `conn-${i}`;

			// Create Visual Path
			const pathVis = document.createElementNS(
				"http://www.w3.org/2000/svg",
				"path",
			);
			let classes = `conn-line layer-${conn.type}`;
			if (conn.isWan) classes += " layer-wan";

			this._setAttrs(pathVis, {
				d,
				stroke: color,
				class: classes,
				id: `path-vis-${i}`,
				"data-from": conn.from,
				"data-to": conn.to,
				"data-conn-id": connId,
				"marker-end": `url(#m-${conn.type})`,
			});
			if (conn.dash) pathVis.setAttribute("stroke-dasharray", "8,4");

			// Create Hitbox Path (Invisible, wider)
			const pathHit = document.createElementNS(
				"http://www.w3.org/2000/svg",
				"path",
			);
			let hitClasses = `conn-hitbox layer-${conn.type}`;
			if (conn.isWan) hitClasses += " layer-wan";
			this._setAttrs(pathHit, {
				d,
				class: hitClasses,
				"data-conn-id": connId,
			});

			// Events
			const connWithColor = { ...conn, color };
			pathHit.addEventListener("click", (e) => {
				e.stopPropagation();
				this.inspectConn(connWithColor);
			});
			pathHit.addEventListener("mouseenter", (e) => {
				pathVis.classList.add("hovered");
				this.showTooltip(e, connWithColor);
				this.hideOtherConnections(connId);
			});
			pathHit.addEventListener("mouseleave", () => {
				pathVis.classList.remove("hovered");
				this.els.tooltip.classList.remove("visible");
				this.showAllConnections();
			});

			this.els.svg.appendChild(pathVis);
			this.els.svg.appendChild(pathHit);
		});

		this.applyFilters();
	}

	_setAttrs(el, attrs) {
		for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
	}

	// =========================================================================
	// 4. INTERACTION HANDLING (DRAG/ZOOM)
	// =========================================================================
	hideOtherConnections(connId) {
		document.querySelectorAll(".conn-line, .conn-hitbox").forEach((line) => {
			if (line.dataset.connId === connId) {
				line.classList.remove("hidden");
			} else {
				line.classList.add("hidden");
			}
		});
	}

	showAllConnections() {
		document.querySelectorAll(".conn-line, .conn-hitbox").forEach((line) => {
			line.classList.remove("hidden");
		});
		this.applyFilters();
	}

	setupInteractions() {
		// Canvas Pan
		if (this.els.wrapper) {
			this.els.wrapper.addEventListener("mousedown", (e) => {
				if (e.target.closest(".node") || e.target.closest(".conn-hitbox"))
					return;
				this.state.isDraggingCanvas = true;
				this.state.dragStartX = e.clientX - this.state.pX;
				this.state.dragStartY = e.clientY - this.state.pY;
				this.els.wrapper.style.cursor = "grabbing";
			});
		}

		// Node Drag
		document.querySelectorAll(".node").forEach((node) => {
			node.addEventListener("mousedown", (e) => {
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

			// Click vs Drag detection
			node.addEventListener("click", (e) => {
				if (Math.abs(e.clientX - this.state.dragStartX) < 5)
					this.inspectNode(node);
			});
		});

		// Window Mouse Events (Movement/Up)
		window.addEventListener("mousemove", (e) => {
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

		window.addEventListener("mouseup", () => {
			this.state.isDraggingCanvas = false;
			this.state.isDraggingNode = false;
			if (this.state.activeNode) {
				this.state.activeNode.style.zIndex = "";
				this.state.activeNode = null;
			}
			if (this.els.wrapper) this.els.wrapper.style.cursor = "grab";
		});

		// Zoom
		if (this.els.wrapper) {
			this.els.wrapper.addEventListener("wheel", (e) => {
				e.preventDefault();
				this.state.scale = Math.min(
					Math.max(0.2, this.state.scale - e.deltaY * 0.001),
					3,
				);
				this.updateTransform();
			});
		}

		// UI Interactions
		const closeBtn = document.getElementById("closeInspector");
		if (closeBtn) {
			closeBtn.addEventListener("click", () => this.closeInspector());
		}
	}

	updateTransform() {
		if (this.els.canvas) {
			this.els.canvas.style.transform = `translate(${this.state.pX}px, ${this.state.pY}px) scale(${this.state.scale})`;
		}
	}

	// =========================================================================
	// 5. INSPECTION & FILTER LOGIC
	// =========================================================================
	toggleLayer(layerId, btn) {
		if (this.state.activeLayers.has(layerId)) {
			this.state.activeLayers.delete(layerId);
			btn.classList.remove("active");
		} else {
			this.state.activeLayers.add(layerId);
			btn.classList.add("active");
		}
		this.applyFilters();
	}

	applyFilters() {
		const allLines = document.querySelectorAll(".conn-line, .conn-hitbox");
		allLines.forEach((line) => {
			// Extract layers from class list "layer-radius", "layer-wan" etc.
			const lineLayers = Array.from(line.classList)
				.filter((c) => c.startsWith("layer-"))
				.map((c) => c.replace("layer-", ""));

			// Show line only if ALL its layers are active
			const isVisible = lineLayers.every((layer) =>
				this.state.activeLayers.has(layer),
			);
			line.classList.toggle("hidden", !isVisible);
		});
	}

	highlightSingleProtocol(layerId) {
		document.querySelectorAll(".conn-line, .conn-hitbox").forEach((line) => {
			const lineLayers = Array.from(line.classList)
				.filter((c) => c.startsWith("layer-"))
				.map((c) => c.replace("layer-", ""));

			if (lineLayers.includes(layerId)) {
				line.classList.remove("hidden");
				line.classList.add("hover-highlight");
			} else {
				line.classList.add("hidden");
				line.classList.remove("hover-highlight");
			}
		});
	}

	clearHoverProtocols() {
		document.querySelectorAll(".conn-line, .conn-hitbox").forEach((line) => {
			line.classList.remove("hover-highlight");
		});
		this.applyFilters();
	}

	filterNodes() {
		const term = this.els.nodeSearch.value.toLowerCase();
		this.state.found = false;

		document.querySelectorAll(".node").forEach((n) => {
			const txt = n.innerText.toLowerCase();
			const match = term.length > 2 && txt.includes(term);
			n.classList.toggle("highlighted", match);

			if (match && !this.state.found) {
				// Auto-pan to first result
				this.state.pX = -parseInt(n.style.left) + window.innerWidth / 2 - 100;
				this.state.pY = -parseInt(n.style.top) + window.innerHeight / 2 - 50;
				this.updateTransform();
				this.state.found = true;
			}
		});
	}

	inspectNode(nodeEl) {
		const nodeData = this.config.nodes.find((n) => n.id === nodeEl.id);
		const doc = nodeData ? this.config.documentation[nodeData.type] : null;
		if (!doc) return;

		const contentHtml = doc.blocks
			.map(
				(b) =>
					`<div class="tech-block">
                <div class="tech-title">${b.title}</div>
                <div class="tech-content">${b.content}</div>
             </div>`,
			)
			.join("");

		this.els.inspTitle.innerText = nodeData.label;
		this.els.inspRole.innerText = doc.role;
		this.els.inspContent.innerHTML = contentHtml;
		this.els.inspector.classList.add("open");
	}

	inspectConn(conn) {
		this.els.inspTitle.innerText = conn.label;
		this.els.inspRole.innerText = "Connection Detail";
		this.els.inspContent.innerHTML = `
            <div class="tech-block">
                <div class="tech-title" style="color:${conn.color}">Technical Specification</div>
                <div class="tech-content">${conn.detail}</div>
            </div>`;
		this.els.inspector.classList.add("open");
	}

	closeInspector() {
		this.els.inspector.classList.remove("open");
	}

	showTooltip(e, conn) {
		this.els.tooltip.querySelector("#ttTitle").innerText = conn.label;
		this.els.tooltip.querySelector("#ttBody").innerHTML = conn.detail;
		this.els.tooltip.classList.add("visible");
		this.els.tooltip.style.left = e.clientX + 15 + "px";
		this.els.tooltip.style.top = e.clientY + 15 + "px";
	}

	// =========================================================================
	// 6. SIMULATION ENGINE
	// =========================================================================
	runSimulation(simId) {
		const sim = this.config.simulations.find((s) => s.id === simId);
		if (!sim) return;

		// Reset previous states
		document
			.querySelectorAll(".active-flow")
			.forEach((p) => p.classList.remove("active-flow"));
		document
			.querySelectorAll(".highlighted")
			.forEach((n) => n.classList.remove("highlighted"));

		this.state.simulationActive = true;
		this.animateSequence(sim.nodes);
	}

	async animateSequence(nodes) {
		for (let i = 0; i < nodes.length - 1; i++) {
			const from = nodes[i];
			const to = nodes[i + 1];

			document.getElementById(from)?.classList.add("highlighted");
			document.getElementById(to)?.classList.add("highlighted");

			const paths = Array.from(document.querySelectorAll(".conn-line"));
			const pathEl = paths.find(
				(p) =>
					(p.getAttribute("data-from") == from &&
						p.getAttribute("data-to") == to) ||
					(p.getAttribute("data-from") == to &&
						p.getAttribute("data-to") == from),
			);

			if (pathEl && !pathEl.classList.contains("hidden")) {
				pathEl.classList.add("active-flow");
				await this.movePacket(pathEl, from, to);
			}
		}

		// Cleanup after animation
		setTimeout(() => {
			document
				.querySelectorAll(".highlighted")
				.forEach((n) => n.classList.remove("highlighted"));
			document
				.querySelectorAll(".active-flow")
				.forEach((p) => p.classList.remove("active-flow"));
			if (this.els.packet) this.els.packet.style.display = "none";
		}, 2000);
	}

	movePacket(pathEl, fromId, toId) {
		return new Promise((resolve) => {
			if (!this.els.packet) {
				resolve();
				return;
			}

			this.els.packet.style.display = "block";
			const len = pathEl.getTotalLength();

			// Determine direction based on geometry
			const pStart = pathEl.getPointAtLength(0);
			const pEnd = pathEl.getPointAtLength(len);
			const nFrom = this.getNodeCenter(document.getElementById(fromId));

			const distToStart = Math.hypot(pStart.x - nFrom.x, pStart.y - nFrom.y);
			const distToEnd = Math.hypot(pEnd.x - nFrom.x, pEnd.y - nFrom.y);
			const reverse = distToStart > distToEnd;

			let progress = 0;
			const animate = () => {
				progress += 0.01; // Speed factor
				const capped = Math.min(progress, 1);
				const point = pathEl.getPointAtLength(
					reverse ? len * (1 - capped) : len * capped,
				);
				const { x, y } = this.toViewportCoords(point);

				this.els.packet.style.left = x - 6 + "px";
				this.els.packet.style.top = y - 6 + "px";

				if (capped >= 1) {
					// Small delay before resolving to ensure visual completion
					setTimeout(() => resolve(), 50);
				} else {
					requestAnimationFrame(animate);
				}
			};
			animate();
		});
	}

	// =========================================================================
	// 7. MATH & UTILITIES
	// =========================================================================
	getNodeCenter(el) {
		if (!el) return { x: 0, y: 0 };
		return {
			x: parseInt(el.style.left) + el.offsetWidth / 2,
			y: parseInt(el.style.top) + el.offsetHeight / 2,
		};
	}

	getNodeEdgePoint(el, towardCenter) {
		const center = this.getNodeCenter(el);
		const dx = towardCenter.x - center.x;
		const dy = towardCenter.y - center.y;

		// Ray casting from center to find intersection with rectangle box
		const hw = el.offsetWidth / 2;
		const hh = el.offsetHeight / 2;
		const tx = dx === 0 ? Infinity : hw / Math.abs(dx);
		const ty = dy === 0 ? Infinity : hh / Math.abs(dy);
		const t = Math.min(tx, ty);

		return {
			x: center.x + dx * t,
			y: center.y + dy * t,
		};
	}

	/**
	 * CRITICAL FIX:
	 * Maps an SVG Coordinate (local) to the Window/CSS Coordinate (global).
	 * This uses the internal state (scale, pX, pY) which is strictly coupled
	 * to the transform applied to the #canvas div.
	 *
	 * Formula: ScreenX = (SvgX * Scale) + PanX
	 */
	toViewportCoords(point) {
		// Packet is positioned inside the transformed canvas, so use raw SVG coords.
		return { x: point.x, y: point.y };
	}
}
