import { normalize } from 'normalizr'
import { camelizeKeys } from 'humps'
import 'isomorphic-fetch'
import qs from 'qs'
import { get, isEmpty, isFunction } from 'lodash'

// Fetches an API response and normalizes the result JSON according to schema.
// This makes every API response have the same shape, regardless of how nested it was.
function callApi ({
  method,
  host,
  endpoint,
  schema,
  token,
  query = {},
  payload,
  transform = json => json
}) {
  const fullUrl = host && (endpoint.indexOf(host) === -1) ? host + '/' + endpoint : endpoint

  if (!token) {
    return Promise.reject(new Error('User is not authenticated'))
  }

  const options = {
    method: method || 'GET',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${token}`
    }
  }

  if (payload) {
    try {
      options.body = JSON.stringify(payload)
    } catch (e) {
      return Promise.reject(new Error('Unable to serialize request payload'))
    }
  }

  return fetch(fullUrl + (!isEmpty(query) ? '?' + qs.stringify(query) : ''), options)
    .then(response => response.json().then(json => ({ json, response })))
    .then(({ json, response }) => {
      if (!response.ok) {
        return Promise.reject(json)
      }

      const camelizedJson = camelizeKeys(json)

      return transform(camelizedJson)
    })
    .then(json => schema ? normalize(json, schema) : json)
}

export const CALL_API = Symbol('API call')

export default (API_ROOT = '') => store => next => action => {
  const callAPI = action[CALL_API]
  if (typeof callAPI === 'undefined') {
    return next(action)
  }

  let { endpoint } = callAPI
  const { method, schema, types, query, transform, payload, onSuccess } = callAPI

  const state = store.getState()

  const token = get(state.auth, 'token', '')

  if (typeof endpoint === 'function') {
    endpoint = endpoint(state)
  }

  if (typeof endpoint !== 'string') {
    throw new Error('Specify a string endpoint URL.')
  }
  // if (!schema) {
  //   throw new Error('Specify one of the exported Schemas.')
  // }
  if (!Array.isArray(types) || types.length !== 3) {
    throw new Error('Expected an array of three action types.')
  }
  if (!types.every(type => typeof type === 'string')) {
    throw new Error('Expected action types to be strings.')
  }

  function actionWith (data) {
    const finalAction = Object.assign({}, action, data)
    delete finalAction[CALL_API]
    return finalAction
  }

  const [ requestType, successType, failureType ] = types
  next(actionWith({ type: requestType }))

  return callApi({ host: API_ROOT, method, endpoint, schema, token, query, transform, payload })
    .then(response => {
      next(actionWith({
        response,
        type: successType
      }))

      if (isFunction(onSuccess)) {
        onSuccess()
      }
    })
    .catch(error => {
      if (process.env.NODE_ENV === 'development') {
        console.error('API request error', error)
      }

      next(
        actionWith({
          type: failureType,
          error: {
            message: error.message,
            stack: error.stack
          }
        })
      )
    })
}
