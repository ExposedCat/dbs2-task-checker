import React from 'react'

import { httpRequest } from '~/services/http.js'
import { useSessionToken } from './useSessionToken.js'

export type UseGetRequestResult<D> = {
	refetch: () => void
} & (
	| {
			state: 'loading'
			data: null
			error: null
	  }
	| {
			state: 'success'
			data: D
			error: null
	  }
	| {
			state: 'error'
			data: null
			error: unknown
	  }
)

export function useGetRequest<D>(
	path: string,
	executeImmediately = true
): UseGetRequestResult<D> {
	const [state, setState] = React.useState<'loading' | 'success' | 'error'>(
		'loading'
	)
	const [data, setData] = React.useState<D | null>(null)
	const [error, setError] = React.useState<unknown | null>(null)

	const immediatelyExecutedRef = React.useRef(!executeImmediately)

	const token = useSessionToken()

	const refetch = React.useCallback(() => {
		void httpRequest<D>({
			method: 'GET',
			path,
			contentType: 'json',
			authorization: token
			// eslint-disable-next-line github/no-then
		})
			.then(response => {
				setState(response.ok ? 'success' : 'error')
				if (response.ok) {
					setData(response.data)
				} else {
					setError(response.error)
				}
			})
			.catch(error => {
				setError(error)
				setState('error')
			})
	}, [path, token])

	React.useEffect(() => {
		if (!immediatelyExecutedRef.current) {
			immediatelyExecutedRef.current = true
			refetch()
		}
	}, [refetch])

	return { state, data, error, refetch } as UseGetRequestResult<D>
}
