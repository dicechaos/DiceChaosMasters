import JSZip from 'jszip';
import type { MeshBufferData } from '../../types/dice';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Encodes a MeshBufferData into a standards-compliant `.3mf` package (unit="millimeter").
 */
export async function encodeThreeMf(
  mesh: MeshBufferData,
  objectName = 'DiceChaosDie',
): Promise<Uint8Array> {
  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`,
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`,
  );

  const numVerts = Math.floor(mesh.positions.length / 3);
  const vertLines: string[] = [];
  for (let i = 0; i < numVerts; i++) {
    const x = mesh.positions[i * 3].toFixed(5);
    const y = mesh.positions[i * 3 + 1].toFixed(5);
    const z = mesh.positions[i * 3 + 2].toFixed(5);
    vertLines.push(`          <vertex x="${x}" y="${y}" z="${z}"/>`);
  }

  const triLines: string[] = [];
  for (let t = 0; t < mesh.triangleCount; t++) {
    const v1 = mesh.indices[t * 3];
    const v2 = mesh.indices[t * 3 + 1];
    const v3 = mesh.indices[t * 3 + 2];
    triLines.push(`          <triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`);
  }

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Application">Dice Chaos Masters</metadata>
  <metadata name="Designer">Dice Chaos (https://dicechaos.com/)</metadata>
  <resources>
    <object id="1" name="${escapeXml(objectName)}" type="model">
      <mesh>
        <vertices>
${vertLines.join('\n')}
        </vertices>
        <triangles>
${triLines.join('\n')}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1"/>
  </build>
</model>`;

  zip.file('3D/3dmodel.model', modelXml);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
