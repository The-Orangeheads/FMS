export interface FileNode {
  id: number;
  name: string;
  path: string;
  size: number;
  date: number;
}

export interface LayoutNode extends FileNode {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
}

export interface SimilarityEdge {
  id: number;
  source: number;
  target: number;
  similarity: number;
}

// The exact same algorithm you already wrote, just running in the background!
function calcLayout(nodes: FileNode[], edges: SimilarityEdge[]): LayoutNode[] {
  if (!nodes || nodes.length === 0) return [];

  const iters = 400;
  const idealDist = 25;
  const kSpring = 0.15;
  const kRepel = 400;
  const kCenter = 0.03;
  const damp = 0.85;
  const minNodeDist = 12; 

  const degree: Record<number, number> = {};
  nodes.forEach((n) => { degree[n.id] = 0; });
  edges.forEach((e) => {
    if (degree[e.source] !== undefined) degree[e.source]++;
    if (degree[e.target] !== undefined) degree[e.target]++;
  });

  const pos: LayoutNode[] = nodes.map((n, i) => {
    const angle = (i * 2 * Math.PI) / nodes.length;
    return {
      ...n,
      x: 50 + Math.cos(angle) * 40,
      y: 50 + Math.sin(angle) * 40,
      vx: 0,
      vy: 0,
    };
  });

  for (let i = 0; i < iters; i++) {
    const alpha = 1 - i / iters;

    for (let a = 0; a < pos.length; a++) {
      for (let b = a + 1; b < pos.length; b++) {
        let dx = pos[a].x - pos[b].x;
        let dy = pos[a].y - pos[b].y;
        let dSq = dx * dx + dy * dy;

        if (dSq === 0) {
          dx = (Math.random() - 0.5);
          dy = (Math.random() - 0.5);
          dSq = dx * dx + dy * dy;
        }

        const d = Math.sqrt(dSq);
        const f = (kRepel / dSq) * alpha;
        
        pos[a].vx! += (dx / d) * f;
        pos[a].vy! += (dy / d) * f;
        pos[b].vx! -= (dx / d) * f;
        pos[b].vy! -= (dy / d) * f;
      }
    }

    for (const edge of edges) {
      const aIdx = pos.findIndex((n) => n.id === edge.source);
      const bIdx = pos.findIndex((n) => n.id === edge.target);
      if (aIdx === -1 || bIdx === -1) continue;

      const a = pos[aIdx];
      const b = pos[bIdx];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d === 0) d = 0.01;

      const linkStrength = 1 / Math.max(1, Math.min(degree[a.id] || 1, degree[b.id] || 1));
      const f = kSpring * linkStrength * edge.similarity * (d - idealDist) * alpha;

      a.vx! += (dx / d) * f;
      a.vy! += (dy / d) * f;
      b.vx! -= (dx / d) * f;
      b.vy! -= (dy / d) * f;
    }

    for (const p of pos) {
      p.vx! += (50 - p.x) * kCenter * alpha;
      p.vy! += (50 - p.y) * kCenter * alpha;
      p.vx = Math.max(-10, Math.min(10, p.vx!));
      p.vy = Math.max(-10, Math.min(10, p.vy!));
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= damp;
      p.vy *= damp;
    }

    for (let k = 0; k < 3; k++) {
      for (let a = 0; a < pos.length; a++) {
        for (let b = a + 1; b < pos.length; b++) {
          let dx = pos[a].x - pos[b].x;
          let dy = pos[a].y - pos[b].y;
          let d = Math.sqrt(dx * dx + dy * dy);
          
          if (d < minNodeDist) {
            if (d === 0) { dx = 0.1; dy = 0.1; d = 0.14; }
            const overlap = (minNodeDist - d) / 2;
            const fixX = (dx / d) * overlap;
            const fixY = (dy / d) * overlap;
            
            pos[a].x += fixX;
            pos[a].y += fixY;
            pos[b].x -= fixX;
            pos[b].y -= fixY;
            
            pos[a].vx! *= 0.5;
            pos[a].vy! *= 0.5;
            pos[b].vx! *= 0.5;
            pos[b].vy! *= 0.5;
          }
        }
      }
    }

    for (const p of pos) {
      p.x = Math.max(2, Math.min(98, p.x));
      p.y = Math.max(2, Math.min(98, p.y));
    }
  }

  return pos;
}

// Listen for messages from the main thread
self.onmessage = (e: MessageEvent<{ nodes: FileNode[]; edges: SimilarityEdge[] }>) => {
  const { nodes, edges } = e.data;
  const layout = calcLayout(nodes, edges);
  // Send the calculated layout back to React
  self.postMessage(layout);
};