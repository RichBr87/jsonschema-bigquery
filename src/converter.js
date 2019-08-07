const converter = module.exports = {}
const _ = require('lodash')

const JSON_SCHEMA_TO_BIGQUERY_TYPE_DICT = {
  boolean: 'BOOLEAN',
  'date-time': 'TIMESTAMP',
  integer: 'INTEGER',
  number: 'FLOAT',
  string: 'STRING'
}

const OFS = ['allOf', 'anyOf', 'oneOf']

converter._merge_property = (merge_type, property_name, destination_value, source_value) => {
  // Merges two properties.
  let destination_list
  if(destination_value === undefined && source_value === undefined){
    return undefined
  }
  if(destination_value === undefined){
    return source_value
  }
  if(source_value === undefined){
    return destination_value
  }
  if(typeof destination_value === 'boolean' && typeof source_value === 'boolean'){
    return destination_value && source_value
  }
  if(_.isPlainObject(destination_value) && _.isPlainObject(source_value)){
    return converter._merge_dicts(merge_type, destination_value, source_value)
  }
  if(Array.isArray(destination_value)){
    destination_list = converter._copy(destination_value)
  }else{
    destination_list = [destination_value]
  }
  let source_list
  if(Array.isArray(source_value)){
    source_list = source_value
  }else{
    source_list = [source_value]
  }
  if(property_name === 'description'){
    destination_list.push(source_value)
    return destination_list.join(' ')
  }
  if(property_name === 'required' && ['anyOf', 'oneOf'].includes(merge_type)){
    return destination_list.filter( v => source_list.includes(v) )
  }
  destination_list.push(...source_list.filter(v=>!destination_list.includes(v)))
  return destination_list
}

converter._copy = (o) => _.clone(o, false)

converter._deepCopy = (o) => _.clone(o, true)

/**
 * Merges multiple sources given as an Array was *dicts,
 * 
 * Cloned from the original merge_dicts from python-based bigjson This method
 * had variable expansion, varags and two slightly different usages which
 * appeared to be incompatible.
 * 
 * Could be returned to a single method
 * 
 * See merge_dicts for the alternate call pattern
 */
converter._merge_dicts_array = (merge_type, dest_dict, source_dicts) => {
  const result = converter._deepCopy(dest_dict)
  for(let source_dict of source_dicts){

    // First check if we need to recurse and merge deeper results first
    for(const x_of of OFS){
      if(_.has(source_dict, x_of)){
        source_dict = converter._merge_dicts_array(x_of, source_dict, source_dict[x_of])
        delete source_dict[x_of]
      }
    }

    const keys = Object.keys(source_dict)
    for(const name of keys){
      const merged_property = converter._merge_property(merge_type, name, result[name], source_dict[name])
      if(merged_property !== undefined){
        result[name] = merged_property
      }
    }
  }
  return result
}

/**
 * Merges a single object
 * 
 * The original merge_dicts from python-based bigjson This method had variable
 * expansion, varags and two slightly different usages which appeared to be
 * incompatible.
 * 
 * Could be returned to a single method
 * 
 * See merge_dicts_array above for the alternate call pattern
 */
converter._merge_dicts = (merge_type, dest_dict, source_dict) => {
  const result = converter._deepCopy(dest_dict)
  const keys = Object.keys(source_dict)
  for(const name of keys){
    const merged_property = converter._merge_property(merge_type, name, result[name], source_dict[name])
    if(merged_property !== undefined){
      result[name] = merged_property
    }
  }
  return result
}

converter._scalar = (name, type_, mode, description) => {
  const bigquery_type = JSON_SCHEMA_TO_BIGQUERY_TYPE_DICT[type_]
  if(!bigquery_type){
    throw new Error(`Invalid type given: ${type_} for '${name}'`)
  }

  const result = {
    name: name,
    type: bigquery_type,
    mode: mode
  }

  if (description) {
    result.description = description
  }

  return result
}

converter._array = (name, node) => {
  let items_with_description = converter._deepCopy(node['items'])
  if(_.has(items_with_description,'description')){
    items_with_description['description'] = node['description']
  }
  return converter._visit(name, items_with_description, 'REPEATED')
}

converter._object = (name, node, mode) => {
  if (node.additionalProperties !== false && converter._options.preventAdditionalObjectProperties) {
    throw new Error(`'object' type properties must have an '"additionalProperties": false' property:\n${JSON.stringify(node, null, 2)}`)
  }
  if(!_.isPlainObject(node.properties)){
    throw new Error(`No properties defined for object:\n${JSON.stringify(node, null, 2)}`)
  }
  if(Object.keys(node.properties).length === 0){
    throw new Error(`Record fields must have one or more child fields:\n${JSON.stringify(node, null, 2)}`)
  }
  const required_properties = node.required || []
  const properties = node.properties

  const fields = Object.keys(properties).map( key => {
    const required = required_properties.includes(key) ? 'REQUIRED' : 'NULLABLE'
    return converter._visit(key,properties[key], required)
  })

  const result = {
    name: name,
    type: 'RECORD',
    mode: mode,
    fields: fields
  }

  if(node.description){
    result.description = node.description
  }
  return result
}

converter._simple = (name, type_, node, mode) => {
  if(type_ === 'array'){
    return converter._array(name, node)
  }
  if(type_ === 'object'){
    return converter._object(name, node, mode)
  }

  let actual_type = type_
  const format_ = node['format']

  if(type_ === 'string' && format_ === 'date-time' ){
    actual_type = format_
  }
  return converter._scalar(name, actual_type, mode, node['description'])
}

converter._visit = (name, node, mode='NULLABLE') => {
  let merged_node = node
  for(const x_of of OFS){
    if(_.has(node, x_of)){
      merged_node = converter._merge_dicts_array(x_of, node, _.get(node, x_of))
      delete merged_node[x_of]
    }
  }
  let type_ = merged_node['type']
  let actual_mode = mode
  if(Array.isArray(type_)){
    const non_null_types = type_.filter(scalar_type => scalar_type !== 'null')
    if(non_null_types.length > 1){
      throw new Error(`union type not supported:\n${JSON.stringify(node, null, 2)}`)
    }
    if(type_.includes('null')){
      actual_mode = 'NULLABLE'
    }
    type_ = non_null_types[0]
  }
  return converter._simple(name, type_, merged_node, actual_mode)
}

converter.run = (input_schema, options = {}) => {
  converter._options = options
  return {
    schema: {
      fields: converter._visit('root', input_schema).fields
    }
  }
}
