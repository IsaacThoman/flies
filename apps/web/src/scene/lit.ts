// A place that works its lights' shadows out in its own shaders (the bar's,
// the restaurant's) hooks them into three.js's light loop here.

/**
 * Three's light loop, with each light's shadow (`shade`, after the line that
 * finds it) and its shading worked out only where it can add anything: where
 * it is on, and on the side a normal faces (the surface's or the clear
 * coat's). Elsewhere the loop would add nothing for it, so the picture is the
 * same; a lamp that is off by day, or a pixel facing away, costs nothing.
 */
export function litOnly(chunk: string, hooks: readonly (readonly [find: string, shade: string])[]) {
  for (const [find, shade] of hooks) {
    if (!chunk.includes(find)) throw new Error(`three.js light chunk changed: ${find}`);
    const reaches = "directLight.color != vec3( 0.0 ) && ( dot( geometryNormal, directLight.direction ) > 0.0 || dot( geometryClearcoatNormal, directLight.direction ) > 0.0 )";
    chunk = chunk.replace(find, `${find}\n\t\tif ( ${reaches} ) directLight.color *= ${shade};\n\t\telse directLight.color = vec3( 0.0 );`);
  }
  const call = "RE_Direct( directLight,";
  if (!chunk.includes(call)) throw new Error(`three.js light chunk changed: ${call}`);
  return chunk.split(call).join(`if ( directLight.color != vec3( 0.0 ) ) ${call}`);
}
