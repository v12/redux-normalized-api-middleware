import test from 'ava'
import { expect } from 'chai'

import middleware from '../src'

test('should export middleware function by default', () => {
  expect(middleware).to.be.a('function')
})
