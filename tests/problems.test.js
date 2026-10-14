import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {PGlite} from '@electric-sql/pglite'
import {seed} from '../src/db.js'
import {problems, schema} from '../src/problems.js'

let db

beforeAll(async () => {
  db = new PGlite()
  await db.waitReady
  await seed(db)
}, 30000)

afterAll(async () => {
  await db?.close()
})

describe('the SQL 50 catalog', () => {
  it('has 50 distinct, complete, ordered exercises with matching schema tables', () => {
    expect(problems).toHaveLength(50)
    expect(problems.map(problem => problem.id)).toEqual(Array.from({length: 50}, (_, index) => index + 1))
    expect(new Set(problems.map(problem => problem.title)).size).toBe(50)
    for (const problem of problems) {
      expect(['Easy', 'Medium', 'Hard']).toContain(problem.difficulty)
      for (const key of ['title', 'topic', 'prompt', 'solution', 'hint']) {
        expect(problem[key].trim(), `${problem.id}: ${key}`).not.toBe('')
      }
    }
    for (const table of Object.keys(schema)) {
      expect(schema[table].length, `${table} has documented columns`).toBeGreaterThan(0)
    }
  })

  it('seeds linked practice data and can seed the same database twice', async () => {
    const counts = await db.query(`
      SELECT (SELECT COUNT(*) FROM customers) AS customers,
             (SELECT COUNT(*) FROM orders) AS orders,
             (SELECT COUNT(*) FROM products) AS products,
             (SELECT COUNT(*) FROM events) AS events
    `)
    expect(counts.rows[0]).toMatchObject({customers: 13, orders: 18, products: 9, events: 10})
    await seed(db)
    const again = await db.query('SELECT COUNT(*) AS count FROM orders')
    expect(again.rows[0].count).toBe(18)
    for (const table of Object.keys(schema)) {
      const result = await db.query(`SELECT * FROM "${table}" LIMIT 1`)
      expect(result.fields.map(field => field.name)).toEqual(
        schema[table].map(column => column.split(' ')[0]),
      )
    }
  })

  it.each(problems)('$id. $title: reference query executes and returns named columns', async problem => {
    const result = await db.query(problem.solution)
    expect(result.fields.length, `${problem.title}: output columns`).toBeGreaterThan(0)
    expect(result.rows.length, `${problem.title}: useful fixture`).toBeGreaterThan(0)
    expect(result.fields.every(field => Boolean(field.name))).toBe(true)
  })

  it('keeps customers with no completed orders and empty departments in the output', async () => {
    const spend = await db.query(problems[21].solution)
    expect(spend.rows.find(row => row.name === 'Moss Analytics')?.completed_spend).toBe('0')
    const payroll = await db.query(problems[20].solution)
    expect(payroll.rows.find(row => row.name === 'Research')).toMatchObject({employee_count: 0, total_salary: '0'})
  })

  it('counts buyers once per product and excludes pending-only purchases', async () => {
    await db.exec('BEGIN')
    try {
      await db.exec(`
        INSERT INTO orders VALUES (101,1,4,'2025-05-21','completed',150),
                                  (102,1,4,'2025-05-22','completed',150);
        INSERT INTO order_items VALUES (101,9,1,150),(102,9,1,150);
      `)
      const result = await db.query(problems[32].solution)
      expect(result.rows.find(row => row.name === 'Query Canvas')?.customer_count).toBe(1)
      expect(result.rows.find(row => row.name === 'Pulse Monitor')?.customer_count).toBe(0)
    } finally {
      await db.exec('ROLLBACK')
    }
  })

  it('uses a read-only PostgreSQL transaction for submissions', async () => {
    const before = (await db.query('SELECT COUNT(*) AS count FROM products')).rows[0].count
    await db.exec('BEGIN TRANSACTION READ ONLY')
    try {
      await expect(db.query(`DELETE FROM products WHERE id = 9`)).rejects.toThrow()
    } finally {
      await db.exec('ROLLBACK')
    }
    expect((await db.query('SELECT COUNT(*) AS count FROM products')).rows[0].count).toBe(before)
  })
})
