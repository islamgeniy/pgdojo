import {PGlite} from '@electric-sql/pglite'

let db
let initPromise
export async function getDb(){
  if(db) return db
  if(!initPromise) initPromise=(async()=>{
    const next=new PGlite('idb://pgdojo-v1')
    try{ await next.waitReady; await seed(next); db=next; return db }
    catch(error){ initPromise=undefined; await next.close().catch(()=>{}); throw error }
  })()
  return initPromise
}
export async function resetDb(){ const d=await getDb(); await d.exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`); await seed(d); return d }
export async function seed(d){
  const exists=await d.query(`SELECT to_regclass('public.customers') AS t`)
  if(exists.rows[0]?.t) return
  await d.exec(`
    CREATE TABLE departments(id int primary key,name text unique not null);
    CREATE TABLE employees(id int primary key,name text not null,department_id int references departments,manager_id int references employees,salary numeric(10,2),hired_at date,active boolean default true);
    CREATE TABLE customers(id int primary key,name text not null,city text,joined_at date,tier text);
    CREATE TABLE products(id int primary key,name text not null,category text,price numeric(10,2),stock int);
    CREATE TABLE orders(id int primary key,customer_id int references customers,employee_id int references employees,ordered_at date,status text,total numeric(10,2));
    CREATE TABLE order_items(order_id int references orders,product_id int references products,quantity int,unit_price numeric(10,2),primary key(order_id,product_id));
    CREATE TABLE events(id int primary key,customer_id int references customers,event_type text,occurred_at timestamp,metadata jsonb);
    INSERT INTO departments VALUES (1,'Engineering'),(2,'Sales'),(3,'Support'),(4,'Finance'),(5,'Research');
    INSERT INTO employees VALUES (1,'Maya Chen',1,NULL,145000,'2018-03-12',true),(2,'Omar Aziz',2,NULL,128000,'2019-06-01',true),(3,'Lena Ortiz',1,1,112000,'2020-01-15',true),(4,'Theo Park',2,2,92000,'2021-05-20',true),(5,'Nia Brooks',3,NULL,87000,'2020-09-09',true),(6,'Ivan Petrov',1,1,108000,'2022-02-14',true),(7,'Sara Kim',2,2,94000,'2022-07-11',false),(8,'Jon Bell',3,5,71000,'2023-04-05',true),(9,'Ava Singh',4,NULL,119000,'2019-11-03',true),(10,'Noah Reed',1,3,97000,'2024-01-08',true);
    INSERT INTO customers VALUES (1,'Northstar Labs','Berlin','2023-01-10','gold'),(2,'Bluebird Studio','London','2023-03-18','silver'),(3,'Cedar Health','Berlin','2023-08-02','gold'),(4,'Drift Works','Austin','2024-01-14','bronze'),(5,'Elm & Co','London','2024-02-20','silver'),(6,'Fjord Systems','Oslo','2024-04-04','gold'),(7,'Glow Market','Austin','2024-06-17','bronze'),(8,'Harbor AI','Singapore','2024-08-30','silver'),(9,'Indigo Foods','Oslo','2024-10-12','gold'),(10,'Juniper Media','Berlin','2025-01-05','bronze'),(11,'Kite Robotics','Seoul','2025-02-11','silver'),(12,'Lumen Bank','London','2025-03-21','gold'),(13,'Moss Analytics','Lisbon','2025-05-08','bronze');
    INSERT INTO products VALUES (1,'Vector Keyboard','hardware',120,25),(2,'Orbit Mouse','hardware',65,0),(3,'Cloud Desk','software',240,999),(4,'Pulse Monitor','hardware',310,8),(5,'Atlas License','software',480,999),(6,'Dock Pro','hardware',180,14),(7,'Signal Pack','service',90,999),(8,'Data Audit','service',650,999),(9,'Query Canvas','software',150,42);
    INSERT INTO orders VALUES (1,1,4,'2024-01-12','completed',360),(2,2,7,'2024-02-03','completed',130),(3,1,4,'2024-03-21','refunded',240),(4,3,2,'2024-05-09','completed',960),(5,4,4,'2024-06-14','pending',310),(6,5,2,'2024-07-01','completed',650),(7,6,7,'2024-08-18','completed',720),(8,3,2,'2024-09-07','completed',480),(9,7,4,'2024-10-22','cancelled',180),(10,8,2,'2024-11-13','completed',960),(11,9,7,'2024-12-05','completed',570),(12,2,4,'2025-01-17','completed',480),(13,10,2,'2025-02-08','pending',240),(14,11,4,'2025-03-11','completed',375),(15,12,2,'2025-04-02','completed',1300),(16,1,4,'2025-04-20','completed',650),(17,6,2,'2025-05-04','completed',480),(18,8,4,'2025-05-19','completed',120);
    INSERT INTO order_items VALUES (1,1,3,120),(2,2,2,65),(3,3,1,240),(4,5,2,480),(5,4,1,310),(6,8,1,650),(7,3,3,240),(8,5,1,480),(9,6,1,180),(10,5,2,480),(11,1,4,120),(11,7,1,90),(12,5,1,480),(13,3,1,240),(14,1,2,120),(14,2,1,65),(14,7,1,70),(15,8,2,650),(16,8,1,650),(17,5,1,480),(18,1,1,120);
    INSERT INTO events VALUES (1,1,'login','2025-05-01 09:10','{"device":"web"}'),(2,1,'purchase','2025-05-01 09:35','{"campaign":"spring"}'),(3,2,'login','2025-05-01 10:00','{"device":"mobile"}'),(4,3,'login','2025-05-02 08:00','{"device":"web"}'),(5,3,'purchase','2025-05-02 08:40','{"campaign":"direct"}'),(6,3,'support','2025-05-03 11:20','{"priority":"high"}'),(7,6,'login','2025-05-03 12:00','{"device":"web"}'),(8,8,'login','2025-05-04 14:15','{"device":"mobile"}'),(9,8,'purchase','2025-05-04 14:50','{"campaign":"spring"}'),(10,12,'login','2025-05-05 16:30','{"device":"web"}');
  `)
}
