// Las paginas de mensajes engordaban al retroceder: con `limit=50` fijo, el log
// mostraba 79 KB -> 98 -> 134 -> 176 -> 216 KB. La causa es `readBy`, que lista a
// TODOS los que han leido cada mensaje y crece con el tiempo, asi que los
// mensajes antiguos son los mas pesados. Ningun cliente lo usa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctrl = readFileSync(join(root, 'src/controllers/conversationController.ts'), 'utf8');

const getMessages = (() => {
  const i = ctrl.indexOf('export async function getMessages');
  assert.ok(i > -1, 'no existe getMessages');
  const resto = ctrl.slice(i + 10);
  const sig = resto.indexOf('\nexport ');
  return sig === -1 ? resto : resto.slice(0, sig);
})();

test('getMessages no devuelve readBy', () => {
  assert.ok(getMessages.includes(".select('-readBy')"), 'falta la proyeccion que quita readBy');
});

test('getMessages usa lean (solo se serializa, no hacen falta documentos)', () => {
  assert.ok(getMessages.includes('.lean()'), 'falta .lean()');
});

test('deletedFor SI se sigue enviando: el cliente lo necesita', () => {
  // MessageBubble devuelve null si el usuario esta en deletedFor. Quitarlo haria
  // reaparecer los mensajes borrados "solo para mi".
  assert.equal(getMessages.includes("-deletedFor"), false, 'deletedFor no se puede excluir');
  const bubble = readFileSync(join(root, '../chat-app-frontend/src/components/chat/MessageBubble.tsx'), 'utf8');
  assert.ok(bubble.includes('item.deletedFor?.includes(currentUserId)'), 'el cliente lo sigue usando');
});

test('el doble tic no depende de readBy, sino de status', () => {
  const bubble = readFileSync(join(root, '../chat-app-frontend/src/components/chat/MessageBubble.tsx'), 'utf8');
  assert.ok(bubble.includes("item.status === 'read'"), 'los tics salen de status');
  assert.equal(/\breadBy\b/.test(bubble), false, 'si el cliente empieza a usar readBy, hay que dejar de excluirlo');
});
