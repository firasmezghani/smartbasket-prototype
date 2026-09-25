import test from 'node:test';
import assert from 'node:assert/strict';
import { designatedDatabase, assertIdentity, verifyPool, MARKER } from './disposableDatabase.js';
test('no opt-in means no database selected', () => assert.equal(designatedDatabase({}), null));
test('protected names, malformed targets and incomplete opt-in fail closed', () => {
  for (const name of ['SmartBasketDemo','smartbasket','SAICO',' SmartBasketDemo ','master','SmartBasketTest_x];DROP','SmartBasketTest_','other']) {
    assert.throws(() => designatedDatabase({SB_TEST_DATABASE:name,SB_TEST_DISPOSABLE:'YES'}));
  }
  assert.throws(() => designatedDatabase({SB_TEST_DATABASE:'SmartBasketTest_unit'}));
  assert.throws(() => designatedDatabase({SB_TEST_DISPOSABLE:'YES'}));
});
test('actual database and marker must both match designation', async () => {
  const expected='SmartBasketTest_unit';
  assert.equal(designatedDatabase({SB_TEST_DATABASE:expected,SB_TEST_DISPOSABLE:'YES'}),expected);
  assertIdentity(expected,{dbName:expected,marker:MARKER});
  for (const row of [{dbName:'SmartBasketDemo',marker:MARKER},{dbName:expected},{dbName:'SmartBasketTest_other',marker:MARKER}]) {
    await assert.rejects(verifyPool({request:()=>({query:async()=>({recordset:[row]})})},expected));
  }
});
