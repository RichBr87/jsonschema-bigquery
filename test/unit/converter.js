const converter = require('../../src/converter')
const assert = require('assert')

describe('converter', () => {
  describe('_visit()', () => {
    context('when multiple types are given', () => {
      it('throws an error', () => {
        assert.throws(() => {
          const node = {
            type: [
              'string',
              'boolean'
            ]
          }
          converter._visit('test', node)
        }, /Union type not supported/)
      })
    })
  })

  describe('_scalar()', () => {
    context('with an unknown type', () => {
      it('throws an error', () => {
        assert.throws(() => {
          converter._scalar('a_name', undefined, 'NULLABLE', 'a description')
        }, /Invalid type given: undefined for 'a_name'/)
      })
    })
  })

  describe('_merge_dicts_array()', () => {
    context('with two string enums', () => {
      it('returns the correct structure', () => {
        const source = [
          {
            "type": "string",
            "enum": [
              "sweets"
            ]
          },
          {
            "type": "string",
            "enum": [
              "shoes"
            ]
          }
        ]
        const result = converter._merge_dicts_array('oneOf', {}, source)
        const expected = {
          "enum": [
            "sweets",
            "shoes"
          ],
          "type": [
            "string"
          ]
        }
        assert.deepStrictEqual(result, expected)
      })
    })

    context('with a nested oneOf containing two string enums', () => {
      it('returns the correct structure', () => {
        const source = [
          {
            oneOf: [
              {
                "type": "string",
                "enum": [
                  "sweets"
                ]
              },
              {
                "type": "string",
                "enum": [
                  "shoes"
                ]
              }
            ]
          },
          {
            "type": "string",
            "enum": [
              "bag"
            ]
          }
        ]
        const result = converter._merge_dicts_array('oneOf', {}, source)
        const expected = {
          "enum": [
            "sweets",
            "shoes",
            "bag"
          ],
          "type": [
            "string"
          ]
        }
        assert.deepStrictEqual(result, expected)
      })
    })
  })

  describe('_object()', () => {
    beforeEach(() => {
      converter._options = {}
    })

    context('without the "preventAdditionalObjectProperties" option', () => {
      it('allows additional properties', () => {
        const node = {
          properties: {
            name: {
              type: 'string'
            }
          }
        }
        assert.doesNotThrow(() => {
          converter._object('test', node, 'NULLABLE')
        }, /"object" type properties must have an '"additionalProperties": false' property/)
      })
    })

    context('with the "ignoreAdditional" option', () => {
      beforeEach(() => {
        converter._options = {
          preventAdditionalObjectProperties: true
        }
      })

      it('does not allow additional properties', () => {
        const node = {
          properties: {}
        }
        assert.throws(() => {
          converter._object('test', node, 'NULLABLE')
        }, /"object" type properties must have an '"additionalProperties": false' property/)
      })
    })

    context('with no properties', () => {
      it('does not allow objects to not have properties defined', () => {
        assert.throws(() => {
          converter._object('test', {}, 'NULLABLE')
        }, /No properties defined for object/)
      })
    })

    context('with zero properties', () => {
      it('does not allow objects to have zero properties defined', () => {
        const node = {
          properties: {}
        }
        assert.throws(() => {
          converter._object('test', node, 'NULLABLE')
        }, /Record fields must have one or more child fields/)
      })
    })
  })

  describe('run()', () => {
    beforeEach(() => {
      converter.run({
        type: 'boolean'
      }, {
        option: true
      })
    })

    it('sets given options', () => {
      assert.deepStrictEqual(converter._options, {
        option: true
      })
    })
  })
})
