import assert from 'node:assert/strict';
import {palettes,defaultTheme,themeTokens,readability,validateTheme,onColour,contrastRatio,type Theme} from '../src/theme.ts';
for(const preset of Object.keys(palettes) as Theme['preset'][]){
 for(const contrast of ['soft','balanced','strong'] as const)for(const sidebar of ['default','light','dark'] as const){
  const theme={...defaultTheme,preset,contrast,sidebar};
  assert.ok(readability(theme).every(check=>check.ratio>=4.5),`${preset}/${contrast}/${sidebar} readability`);
  assert.equal(validateTheme(theme).preset,preset);
 }
 for(const corners of ['sharp','soft','round'] as const){
  const tokens=themeTokens({...defaultTheme,preset,corners});
  for(const name of ['bg','surface','surface-2','ink','muted','line','line-strong','primary','on-primary','accent','on-accent','soft','soft-ink','danger','danger-soft','sidebar','sidebar-ink','sidebar-muted','sidebar-active','radius-card','radius-control','radius-chip','shadow-card','shadow-panel','shadow-control'])assert.ok(tokens['--'+name],name);
 }
}
for(const colour of ['#000000','#FFFFFF','#0078D4','#808080']){
 assert.ok(contrastRatio(colour,onColour(colour))>=Math.max(contrastRatio(colour,'#FFFFFF'),contrastRatio(colour,'#151613')));
}
assert.throws(()=>validateTheme({...defaultTheme,primary:'url(bad)'}));
console.log('All palette, contrast, sidebar and corner combinations passed.');
