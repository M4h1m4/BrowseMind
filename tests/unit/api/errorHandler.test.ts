import { errorHandler } from '../../../src/api/middleware/errorHandler'
import { Request, Response, NextFunction } from 'express'

function makeMockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json:   jest.fn().mockReturnThis()
  }
  return res as unknown as Response
}

describe('errorHandler middleware', () => {
  it('responds with 500 and the error message as JSON', () => {
    const err  = new Error('database connection failed')
    const req  = { method: 'POST', path: '/api/v1/capture/run' } as Request
    const res  = makeMockRes()
    const next = jest.fn() as NextFunction

    errorHandler(err, req, res, next)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'database connection failed' })
  })

  it('does not call next after handling the error', () => {
    const next = jest.fn() as NextFunction
    errorHandler(new Error('boom'), {} as Request, makeMockRes(), next)
    expect(next).not.toHaveBeenCalled()
  })

  it('uses err.status when present instead of defaulting to 500', () => {
    const err = Object.assign(new Error('bad json'), { status: 400 })
    const res = makeMockRes()
    errorHandler(err, {} as Request, res, jest.fn() as NextFunction)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('defaults to 500 when err.status is not set', () => {
    const err  = new Error('unexpected')
    const res  = makeMockRes()
    errorHandler(err, {} as Request, res, jest.fn() as NextFunction)
    expect(res.status).toHaveBeenCalledWith(500)
  })
})
