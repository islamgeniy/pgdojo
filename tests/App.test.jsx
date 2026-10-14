// @vitest-environment jsdom
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import App from '../src/App.jsx'
import {problems} from '../src/problems.js'

const mocks = vi.hoisted(() => ({getDb: vi.fn(), resetDb: vi.fn()}))

vi.mock('../src/db', () => mocks)
vi.mock('@uiw/react-codemirror', () => ({
  default: ({value, onChange, onKeyDown}) => (
    <textarea aria-label="SQL editor" value={value} onChange={event => onChange(event.target.value)} onKeyDown={onKeyDown}/>
  ),
}))

const products = {
  fields: [{name: 'id'}, {name: 'name'}],
  rows: [{id: 1, name: 'Vector Keyboard'}, {id: 2, name: 'Orbit Mouse'}],
}
let db
let previewName

beforeEach(() => {
  const stored = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: key => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, String(value)),
      removeItem: key => stored.delete(key),
      clear: () => stored.clear(),
    },
  })
  previewName = 'Vector Keyboard'
  db = {
    exec: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(async statement => {
      if (statement.startsWith('SELECT * FROM "')) {
        return {fields: [{name: 'name'}], rows: [{name: previewName}]}
      }
      if (statement.trim().replace(/;$/, '') === problems[0].solution.replace(/;$/, '') ||
          statement.includes('SELECT * FROM products ORDER BY id')) return products
      if (statement.includes('SELECT 42 AS answer')) return {fields: [{name: 'answer'}], rows: [{answer: 42}]}
      return {fields: [{name: 'id'}], rows: [{id: 1}]}
    }),
  }
  mocks.getDb.mockReset().mockResolvedValue(db)
  mocks.resetDb.mockReset().mockImplementation(async () => {
    previewName = 'Cloud Desk'
    return db
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the local SQL workbench', () => {
  it('keeps Run and Check outside the editor panel when mobile results are selected', async () => {
    const {container} = render(<App/>)
    expect(container.querySelector('.mobile-view-challenge')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', {name: /Write query/}))
    expect(container.querySelector('.mobile-view-editor')).toBeTruthy()

    const queryPane = container.querySelector('.query-pane')
    const actionBar = queryPane.querySelector(':scope > .editor-actions')
    expect(actionBar).toBeTruthy()
    expect(queryPane.querySelector('.editor-shell .editor-actions')).toBeNull()
    fireEvent.change(screen.getByRole('textbox', {name: 'SQL editor'}), {target: {value: problems[0].solution}})
    fireEvent.click(screen.getByRole('button', {name: /Run query/}))
    await waitFor(() => expect(container.querySelector('.mobile-view-results')).toBeTruthy())
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/2 rows returned/))
    expect(actionBar.contains(screen.getByRole('button', {name: /Run query/}))).toBe(true)
    expect(actionBar.contains(screen.getByRole('button', {name: /Check answer/}))).toBe(true)

    fireEvent.click(screen.getByRole('button', {name: /Check answer/}))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Accepted/))
  })

  it('navigates exercises and restores each saved draft after reopening', async () => {
    const view = render(<App/>)
    fireEvent.change(screen.getByRole('textbox', {name: 'SQL editor'}), {target: {value: 'SELECT name FROM products'}})
    fireEvent.click(screen.getByRole('button', {name: /Names and prices/}))
    expect(screen.getByRole('heading', {name: 'Names and prices'})).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', {name: 'SQL editor'}), {target: {value: 'SELECT price FROM products'}})
    fireEvent.click(screen.getByRole('button', {name: /Meet the catalog/}))
    expect(screen.getByRole('textbox', {name: 'SQL editor'}).value).toBe('SELECT name FROM products')
    view.unmount()
    render(<App/>)
    expect(screen.getByRole('textbox', {name: 'SQL editor'}).value).toBe('SELECT name FROM products')
    fireEvent.click(screen.getByRole('button', {name: /Names and prices/}))
    expect(screen.getByRole('textbox', {name: 'SQL editor'}).value).toBe('SELECT price FROM products')
  })

  it('runs a query, checks the answer, and reports incorrect results', async () => {
    render(<App/>)
    const editor = screen.getByRole('textbox', {name: 'SQL editor'})
    fireEvent.change(editor, {target: {value: problems[0].solution}})
    fireEvent.click(screen.getByRole('button', {name: /Run query/}))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/2 rows returned/))
    expect(screen.getByText('Vector Keyboard')).toBeTruthy()
    expect(db.exec).toHaveBeenCalledWith('BEGIN TRANSACTION READ ONLY')
    expect(db.exec).toHaveBeenCalledWith('ROLLBACK')

    fireEvent.click(screen.getByRole('button', {name: /Check answer/}))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Accepted/))
    expect(screen.getByLabelText('1 of 50 problems solved')).toBeTruthy()

    fireEvent.change(editor, {target: {value: 'SELECT 42 AS answer'}})
    fireEvent.click(screen.getByRole('button', {name: /Check answer/}))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/result differs/))
  })

  it('accepts a valid SQL query with a leading comment', async () => {
    render(<App/>)
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Ready to run PostgreSQL queries/))
    fireEvent.change(screen.getByRole('textbox', {name: 'SQL editor'}), {
      target: {value: '-- all catalog items\nSELECT * FROM products ORDER BY id'},
    })
    fireEvent.click(screen.getByRole('button', {name: /Run query/}))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/2 rows returned/))
    expect(screen.getByText('Vector Keyboard')).toBeTruthy()
  })

  it('accepts equivalent rows in another order when the task specifies no ordering', async () => {
    const expected = {fields: [{name: 'name'}, {name: 'customer_count'}], rows: [
      {name: 'Vector Keyboard', customer_count: 3},
      {name: 'Query Canvas', customer_count: 0},
    ]}
    db.query.mockImplementation(async statement => {
      if (statement === problems[32].solution) return expected
      if (statement.includes('ORDER BY p.name')) return {...expected, rows: [...expected.rows].reverse()}
      throw new Error(`Unexpected SQL: ${statement}`)
    })
    render(<App/>)
    fireEvent.click(screen.getByRole('button', {name: /Product penetration/}))
    fireEvent.change(screen.getByRole('textbox', {name: 'SQL editor'}), {target: {value:
      `SELECT p.name, COUNT(DISTINCT o.customer_id) AS customer_count
       FROM products p
       LEFT JOIN order_items oi ON oi.product_id = p.id
       LEFT JOIN orders o ON o.id = oi.order_id AND o.status = 'completed'
       GROUP BY p.id, p.name ORDER BY p.name`,
    }})
    fireEvent.click(screen.getByRole('button', {name: /Check answer/}))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Accepted/))
  })

  it('preserves duplicate counts when an unordered result is checked', async () => {
    const fields = [{name: 'name'}, {name: 'customer_count'}]
    db.query.mockImplementation(async statement => {
      if (statement === problems[32].solution) return {fields, rows: [
        {name: 'Alpha', customer_count: 1},
        {name: 'Alpha', customer_count: 1},
        {name: 'Beta', customer_count: 2},
      ]}
      return {fields, rows: [
        {name: 'Alpha', customer_count: 1},
        {name: 'Beta', customer_count: 2},
        {name: 'Beta', customer_count: 2},
      ]}
    })
    render(<App/>)
    fireEvent.click(screen.getByRole('button', {name: /Product penetration/}))
    fireEvent.change(screen.getByRole('textbox', {name: 'SQL editor'}), {target: {value: 'SELECT name, customer_count FROM practice'}})
    fireEvent.click(screen.getByRole('button', {name: /Check answer/}))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/result differs/))
  })

  it('rejects reversed rows when the task requires output order', async () => {
    db.query.mockImplementation(async statement => statement === problems[0].solution
      ? products
      : {...products, rows: [...products.rows].reverse()})
    render(<App/>)
    fireEvent.change(screen.getByRole('textbox', {name: 'SQL editor'}), {target: {value: 'SELECT * FROM products ORDER BY id DESC'}})
    fireEvent.click(screen.getByRole('button', {name: /Check answer/}))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/result differs/))
  })

  it('rejects text when the expected result column is numeric', async () => {
    db.query.mockImplementation(async statement => statement === problems[11].solution
      ? {fields: [{name: 'order_count', dataTypeID: 20}], rows: [{order_count: '18'}]}
      : {fields: [{name: 'order_count', dataTypeID: 25}], rows: [{order_count: '18'}]})
    render(<App/>)
    fireEvent.click(screen.getByRole('button', {name: /Order count/}))
    fireEvent.change(screen.getByRole('textbox', {name: 'SQL editor'}), {target: {value: "SELECT '18' AS order_count"}})
    fireEvent.click(screen.getByRole('button', {name: /Check answer/}))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/result differs/))
  })

  it('allows keywords and semicolons inside SQL comments and strings', async () => {
    render(<App/>)
    fireEvent.change(screen.getByRole('textbox', {name: 'SQL editor'}), {
      target: {value: "/* DELETE is only a comment */ SELECT 'UPDATE; text' AS note"},
    })
    fireEvent.click(screen.getByRole('button', {name: /Run query/}))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/rows returned/))
    expect(db.query).toHaveBeenCalledWith("/* DELETE is only a comment */ SELECT 'UPDATE; text' AS note")
  })

  it('blocks mutating SQL before it reaches PostgreSQL', async () => {
    render(<App/>)
    fireEvent.change(screen.getByRole('textbox', {name: 'SQL editor'}), {target: {value: 'DELETE FROM products'}})
    fireEvent.click(screen.getByRole('button', {name: /Run query/}))
    expect(screen.getByRole('status').textContent).toMatch(/read-only SELECT/)
    expect(db.query).not.toHaveBeenCalled()
    expect(db.exec).not.toHaveBeenCalled()
  })

  it('shows real sample rows and refreshes them after resetting data', async () => {
    render(<App/>)
    fireEvent.click(screen.getByRole('button', {name: 'Schema & data'}))
    fireEvent.click(screen.getByRole('button', {name: 'products'}))
    await waitFor(() => expect(screen.getByText('Vector Keyboard')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', {name: /Reset data/}))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Sample data restored/))
    await waitFor(() => expect(screen.getByText('Cloud Desk')).toBeTruthy())
    expect(mocks.resetDb).toHaveBeenCalledOnce()
  })

  it('resets only the current draft and supports the keyboard run shortcut', async () => {
    render(<App/>)
    const editor = screen.getByRole('textbox', {name: 'SQL editor'})
    fireEvent.change(editor, {target: {value: problems[0].solution}})
    fireEvent.keyDown(editor, {key: 'Enter', metaKey: true})
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/2 rows returned/))
    fireEvent.click(screen.getByRole('button', {name: /Reset query/}))
    expect(editor.value).toBe('-- Write your PostgreSQL query here\nSELECT ')
    expect(JSON.parse(localStorage.getItem('pgdojo-drafts'))['1']).toBe(editor.value)
  })
})
