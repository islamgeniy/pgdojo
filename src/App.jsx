import {useEffect,useMemo,useState} from 'react'
import CodeMirror from '@uiw/react-codemirror'
import {sql,PostgreSQL} from '@codemirror/lang-sql'
import {ArrowLeft,ArrowRight,BookOpen,Check,CheckCircle2,ChevronRight,Clipboard,Code2,Database,FileCode2,Info,Lightbulb,ListFilter,Menu,Play,RotateCcw,Search,Table2,X} from 'lucide-react'
import {getDb,resetDb} from './db'
import {problems,schema} from './problems'

const storage={
  get:(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}},
  set:(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
}
const starter='-- Write your PostgreSQL query here\nSELECT '
const formatValue=value=>value instanceof Date?value.toISOString():typeof value==='bigint'?String(value):typeof value==='object'&&value!==null?JSON.stringify(value):String(value??'NULL')
const difficultyClass={Easy:'badge-success',Medium:'badge-warning',Hard:'badge-error'}
const tableSuggestions={
  SELECT:['products','customers','employees'],
  Filtering:['products','customers','employees'],
  JOIN:['orders','customers','employees'],
  JSON:['events','customers'],
  'Window functions':['orders','employees','departments']
}
function sqlCodeOnly(query){
  const code=query.split('')
  const mask=(start,end)=>{for(let index=start;index<end;index++)code[index]=' '}
  for(let index=0;index<query.length;){
    if(query.startsWith('--',index)){
      const end=query.indexOf('\n',index)
      const next=end<0?query.length:end
      mask(index,next)
      index=next
    }else if(query.startsWith('/*',index)){
      const start=index
      let depth=1
      index+=2
      while(index<query.length&&depth){
        if(query.startsWith('/*',index)){depth++;index+=2}
        else if(query.startsWith('*/',index)){depth--;index+=2}
        else index++
      }
      if(depth)return null
      mask(start,index)
    }else if(query[index]==="'"||query[index]==='"'){
      const start=index
      const quote=query[index]
      const escaped=quote==="'"&&/[eE]/.test(query[index-1]||'')&&(index<2||!/[\w$]/.test(query[index-2]))
      index++
      let closed=false
      while(index<query.length){
        if(escaped&&query[index]==='\\'){index+=2;continue}
        if(query[index]===quote){
          if(query[index+1]===quote){index+=2;continue}
          index++
          closed=true
          break
        }
        index++
      }
      if(!closed)return null
      mask(start,index)
    }else if(query[index]==='$'){
      const delimiter=query.slice(index).match(/^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/)?.[0]
      if(!delimiter){index++;continue}
      const end=query.indexOf(delimiter,index+delimiter.length)
      if(end<0)return null
      const next=end+delimiter.length
      mask(index,next)
      index=next
    }else index++
  }
  return code.join('')
}
function typedValue(value){
  if(value===null)return ['null']
  if(value instanceof Date)return ['date',value.toISOString()]
  if(Array.isArray(value))return ['array',value.map(typedValue)]
  if(typeof value==='object')return ['object',Object.keys(value).sort().map(key=>[key,typedValue(value[key])])]
  if(typeof value==='bigint')return ['bigint',String(value)]
  if(typeof value==='number'&&!Number.isFinite(value))return ['number',String(value)]
  return [typeof value,value]
}
function matches(actual,expected,orderSensitive){
  if(actual.fields.length!==expected.fields.length||actual.rows.length!==expected.rows.length)return false
  if(actual.fields.some((field,index)=>field.name!==expected.fields[index].name||
    (field.dataTypeID!=null&&expected.fields[index].dataTypeID!=null&&field.dataTypeID!==expected.fields[index].dataTypeID)))return false
  const rowKey=row=>JSON.stringify(actual.fields.map(field=>typedValue(row[field.name])))
  if(orderSensitive)return actual.rows.every((row,index)=>rowKey(row)===rowKey(expected.rows[index]))
  const remaining=new Map()
  for(const row of expected.rows){const key=rowKey(row);remaining.set(key,(remaining.get(key)||0)+1)}
  for(const row of actual.rows){
    const key=rowKey(row)
    const count=remaining.get(key)||0
    if(!count)return false
    remaining.set(key,count-1)
  }
  return true
}
function StatusMark({done,tried}){
  if(done)return <span className="problem-status solved" aria-label="Solved"><Check size={12} strokeWidth={3}/></span>
  if(tried)return <span className="problem-status tried" aria-label="Attempted"><span/></span>
  return <span className="problem-status" aria-label="Not started"/>
}
function DataPreview({table,resetVersion}){
  const [data,setData]=useState({loading:true,fields:[],rows:[],error:''})
  useEffect(()=>{
    let active=true
    setData({loading:true,fields:[],rows:[],error:''})
    getDb().then(db=>db.query('SELECT * FROM "'+table+'" LIMIT 4')).then(result=>{
      if(active)setData({loading:false,fields:result.fields,rows:result.rows,error:''})
    }).catch(error=>{if(active)setData({loading:false,fields:[],rows:[],error:error.message})})
    return()=>{active=false}
  },[table,resetVersion])
  if(data.loading)return <p className="muted">Loading sample rows…</p>
  if(data.error)return <p className="text-error">{data.error}</p>
  return <div className="preview-table-wrap"><table className="table table-xs table-zebra"><thead><tr>{data.fields.map((field,index)=><th key={index}>{field.name}</th>)}</tr></thead><tbody>{data.rows.map((row,index)=><tr key={index}>{data.fields.map((field,column)=><td key={column}>{formatValue(row[field.name])}</td>)}</tr>)}</tbody></table></div>
}
function ResultGrid({result}){
  if(!result.fields?.length)return <p className="result-note">The query completed without a table result.</p>
  if(!result.rows.length)return <div className="empty-results"><Table2 size={26}/><strong>No rows returned</strong><span>Change your conditions and run the query again.</span></div>
  return <div className="result-scroll"><table className="table table-sm table-pin-rows result-table"><thead><tr><th className="row-number">#</th>{result.fields.map((field,index)=><th key={index}>{field.name}</th>)}</tr></thead><tbody>{result.rows.map((row,index)=><tr key={index}><td className="row-number">{index+1}</td>{result.fields.map((field,column)=><td key={column}>{formatValue(row[field.name])}</td>)}</tr>)}</tbody></table></div>
}

export default function App(){
  const [selected,setSelected]=useState(()=>storage.get('pgdojo-last',1))
  const problem=problems.find(item=>item.id===selected)||problems[0]
  const [query,setQuery]=useState(()=>storage.get('pgdojo-drafts',{})[selected]||starter)
  const [solved,setSolved]=useState(()=>storage.get('pgdojo-solved',[]))
  const [attempted,setAttempted]=useState(()=>storage.get('pgdojo-attempted',[]))
  const [result,setResult]=useState(null)
  const [message,setMessage]=useState({kind:'idle',text:'Preparing your local database…'})
  const [running,setRunning]=useState(false)
  const [filter,setFilter]=useState('All')
  const [search,setSearch]=useState('')
  const [promptTab,setPromptTab]=useState('task')
  const [schemaTable,setSchemaTable]=useState('orders')
  const [hintOpen,setHintOpen]=useState(false)
  const [mobileList,setMobileList]=useState(false)
  const [mobileView,setMobileView]=useState('challenge')
  const [copied,setCopied]=useState(false)
  const [resetVersion,setResetVersion]=useState(0)

  useEffect(()=>{
    getDb().then(()=>setMessage({kind:'idle',text:'Ready to run PostgreSQL queries'}))
      .catch(error=>setMessage({kind:'error',text:error.message}))
  },[])
  useEffect(()=>{
    storage.set('pgdojo-last',selected)
    setQuery(storage.get('pgdojo-drafts',{})[selected]||starter)
    setResult(null)
    setHintOpen(false)
    setMessage({kind:'idle',text:'Ready to run PostgreSQL queries'})
  },[selected])
  useEffect(()=>{
    if(!mobileList)return
    const onKey=event=>{if(event.key==='Escape')setMobileList(false)}
    const onResize=()=>{if(window.innerWidth>980)setMobileList(false)}
    window.addEventListener('keydown',onKey)
    window.addEventListener('resize',onResize)
    return()=>{window.removeEventListener('keydown',onKey);window.removeEventListener('resize',onResize)}
  },[mobileList])

  const shown=useMemo(()=>problems.filter(item=>(filter==='All'||item.difficulty===filter)&&
    (String(item.id)+' '+item.title+' '+item.topic).toLowerCase().includes(search.toLowerCase())),[filter,search])
  const percent=Math.round(solved.length/problems.length*100)
  const suggestions=tableSuggestions[problem.topic]||['orders','customers','products']
  const status=solved.includes(selected)?'Solved':attempted.includes(selected)?'In progress':'Not started'

  function updateQuery(value){
    setQuery(value)
    const drafts=storage.get('pgdojo-drafts',{})
    drafts[selected]=value
    storage.set('pgdojo-drafts',drafts)
  }
  function choose(id){
    setSelected(id)
    setMobileList(false)
    setMobileView('challenge')
  }
  async function execute(check=false){
    const clean=query.trim()
    const code=sqlCodeOnly(clean)
    const semicolon=code?.indexOf(';')??-1
    if(!code||!/^(select|with|values|table|explain)\b/i.test(code.trim())||
      (semicolon>=0&&code.slice(semicolon+1).trim())||
      /\b(insert|update|delete|merge|create|alter|drop|truncate|copy|call|do|grant|revoke|vacuum|begin|commit|rollback)\b/i.test(code)){
      setMessage({kind:'error',text:'Write one read-only SELECT query, then run it again.'})
      setMobileView('results')
      return
    }
    setRunning(true)
    setMessage({kind:'idle',text:check?'Checking your answer…':'Running your query…'})
    const start=performance.now()
    let db
    try{
      db=await getDb()
      await db.exec('BEGIN TRANSACTION READ ONLY')
      const output=await db.query(clean)
      setResult(output)
      setAttempted(current=>{
        const next=[...new Set([...current,selected])]
        storage.set('pgdojo-attempted',next)
        return next
      })
      if(check){
        const expected=await db.query(problem.solution)
        if(matches(output,expected,problem.orderSensitive)){
          setMessage({kind:'success',text:'Accepted. '+output.rows.length+' rows matched in '+Math.round(performance.now()-start)+' ms.'})
          setSolved(current=>{
            const next=[...new Set([...current,selected])]
            storage.set('pgdojo-solved',next)
            return next
          })
        }else setMessage({kind:'error',text:'The result differs from the expected output. Check column names, types, values, duplicates'+(problem.orderSensitive?', and order.':'.')})
      }else setMessage({kind:'idle',text:output.rows.length+' rows returned in '+Math.round(performance.now()-start)+' ms.'})
    }catch(error){
      setResult(null)
      setMessage({kind:'error',text:error.message.split('\n')[0]})
    }finally{
      if(db)try{await db.exec('ROLLBACK')}catch{}
      setRunning(false)
      setMobileView('results')
    }
  }
  async function restoreDatabase(){
    setRunning(true)
    try{await resetDb();setResetVersion(version=>version+1);setMessage({kind:'idle',text:'Sample data restored.'});setResult(null)}
    catch(error){setMessage({kind:'error',text:error.message})}
    finally{setRunning(false)}
  }
  async function copyResults(){
    if(!result?.fields.length)return
    const fields=result.fields.map(field=>field.name)
    const csv=[fields,...result.rows.map(row=>fields.map(field=>row[field]))]
      .map(line=>line.map(value=>'"'+formatValue(value).replaceAll('"','""')+'"').join(',')).join('\n')
    try{
      await navigator.clipboard.writeText(csv)
      setCopied(true)
      window.setTimeout(()=>setCopied(false),2200)
    }catch{setMessage({kind:'error',text:'Clipboard access was blocked by your browser.'})}
  }

  return <div className="app-shell">
    <a href="#workspace" className="skip-link btn btn-sm">Skip to workspace</a>
    <header className="topbar">
      <button className="btn btn-ghost btn-square mobile-menu" onClick={()=>setMobileList(true)} aria-label="Open problems"><Menu size={21}/></button>
      <div className="brand-mark" aria-hidden="true"><span>{'{'}</span><i/><span>{'}'}</span></div>
      <div className="brand-copy"><strong>pg<span>dojo</span></strong><small>SQL practice studio</small></div>
      <div className="topbar-divider"/>
      <span className="topbar-location">Practice <ChevronRight size={14}/> SQL 50</span>
      <div className="topbar-right">
        <div className="header-progress" aria-label={solved.length+' of 50 problems solved'}>
          <div><span>Your progress</span><strong>{solved.length}<span>/50</span></strong></div>
          <progress className="progress progress-primary" value={solved.length} max="50"/>
        </div>
        <span className="local-pill"><i/> Local workspace</span>
      </div>
    </header>
    <main id="workspace" className={'workbench mobile-view-'+mobileView}>
      {mobileList&&<button className="sidebar-scrim" aria-label="Close problem list" onClick={()=>setMobileList(false)}/>}
      <aside className={'sidebar '+(mobileList?'sidebar-open':'')} aria-label="Problem list">
        <div className="sidebar-heading"><div><small>Curriculum</small><h2>Problem set</h2></div><button className="btn btn-ghost btn-square sidebar-close" aria-label="Close problem list" onClick={()=>setMobileList(false)}><X size={20}/></button></div>
        <div className="sidebar-progress"><div><span>SQL 50 track</span><strong>{percent}%</strong></div><progress className="progress progress-primary" value={solved.length} max="50"/><p>{solved.length===0?'Start with a query and build your streak.':solved.length+' solved · '+(50-solved.length)+' to go'}</p></div>
        <div className="sidebar-tools">
          <label className="input search-input"><Search size={18}/><input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Find a problem" aria-label="Find a problem"/></label>
          <div className="filter-row" role="group" aria-label="Filter by difficulty"><ListFilter size={16}/>{['All','Easy','Medium','Hard'].map(value=><button key={value} className={'filter-button '+(filter===value?'active':'')} onClick={()=>setFilter(value)} aria-pressed={filter===value}>{value}</button>)}</div>
        </div>
        <nav className="sidebar-list" aria-label="Choose a SQL problem">
          {shown.length?shown.map(item=><button key={item.id} className={'problem-link '+(selected===item.id?'active':'')} aria-current={selected===item.id?'page':undefined} onClick={()=>choose(item.id)}>
            <StatusMark done={solved.includes(item.id)} tried={attempted.includes(item.id)}/>
            <span className="problem-link-copy"><strong>{item.title}</strong><small>{item.topic}</small></span>
            <span className="problem-link-number">{String(item.id).padStart(2,'0')}</span>
          </button>):<div className="sidebar-empty">No problems match “{search}”. Try another search or difficulty.</div>}
        </nav>
        <div className="sidebar-footer"><Database size={15}/><span>Progress saves in this browser</span></div>
      </aside>
      <div className="mobile-view-switch" role="group" aria-label="Workspace view">
        {['challenge','editor','results'].map(view=><button key={view} className={mobileView===view?'active':''} onClick={()=>setMobileView(view)} aria-pressed={mobileView===view}>{view==='challenge'?'Challenge':view==='editor'?'Editor':'Results'}</button>)}
      </div>
      <section className="challenge-pane" aria-label="Challenge">
        <div className="pane-topline"><div className="crumb"><BookOpen size={16}/><span>Practice / {problem.topic}</span></div><span className="challenge-counter">{String(problem.id).padStart(2,'0')} <span>/ 50</span></span></div>
        <div className="prompt-tabs" role="group" aria-label="Challenge details">
          <button aria-pressed={promptTab==='task'} className={promptTab==='task'?'active':''} onClick={()=>setPromptTab('task')}>Task</button>
          <button aria-pressed={promptTab==='schema'} className={promptTab==='schema'?'active':''} onClick={()=>setPromptTab('schema')}>Schema & data</button>
        </div>
        <div className="challenge-scroll">
          {promptTab==='task'?<div className="challenge-content">
            <div className="challenge-meta"><span className={'badge badge-soft '+difficultyClass[problem.difficulty]}>{problem.difficulty}</span><span className="topic-pill">{problem.topic}</span><span className="status-copy">{status}</span></div>
            <h1>{problem.title}</h1><p className="challenge-description">{problem.prompt}</p>
            <div className="section-rule"><span>Work with the data</span></div>
            <p className="support-copy">Explore the tables before you write your query. The sample data includes customers, orders, products, employees, and event activity.</p>
            <div className="table-shortcuts">{suggestions.map(table=><button key={table} onClick={()=>{setSchemaTable(table);setPromptTab('schema')}}><Table2 size={16}/><span>{table}</span><ChevronRight size={14}/></button>)}</div>
            <div className="hint-area"><button className="hint-trigger" onClick={()=>setHintOpen(!hintOpen)} aria-expanded={hintOpen}><Lightbulb size={18}/><span>{hintOpen?'Hide hint':'Need a hint?'}</span><ChevronRight size={16} className={hintOpen?'rotate-90':''}/></button>{hintOpen&&<div className="alert alert-info hint-text"><Info size={18}/><span>{problem.hint}</span></div>}</div>
          </div>:<div className="schema-content">
            <h2>Explore the database</h2><p>Select a table to inspect its columns and a few rows of real sample data.</p>
            <div className="schema-layout">
              <div className="schema-list">{Object.keys(schema).map(table=><button key={table} className={schemaTable===table?'active':''} onClick={()=>setSchemaTable(table)} aria-pressed={schemaTable===table}><Database size={15}/><span>{table}</span><ChevronRight size={14}/></button>)}</div>
              <div className="schema-detail"><div className="schema-detail-title"><Table2 size={18}/><strong>{schemaTable}</strong><span>{schema[schemaTable].length} columns</span></div><div className="column-list">{schema[schemaTable].map(column=><div key={column}><span>{column.split(' ')[0]}</span>{column.includes('PK')&&<small>PK</small>}{column.includes('FK')&&<small>FK</small>}{column.includes('jsonb')&&<small>JSONB</small>}</div>)}</div><h3>Sample rows</h3><DataPreview table={schemaTable} resetVersion={resetVersion}/></div>
            </div>
          </div>}
        </div>
        <button className="btn btn-primary open-editor" onClick={()=>setMobileView('editor')}><FileCode2 size={17}/>Write query<ArrowRight size={17}/></button>
        <div className="challenge-footer"><button className="btn btn-ghost" disabled={selected===1} onClick={()=>choose(selected-1)}><ArrowLeft size={17}/>Previous</button><span>{selected} of 50</span><button className="btn btn-ghost" disabled={selected===50} onClick={()=>choose(selected+1)}>Next<ArrowRight size={17}/></button></div>
      </section>
      <section className="query-pane" aria-label="SQL editor and results">
        <div className="editor-shell">
          <div className="editor-toolbar"><div className="file-name"><FileCode2 size={17}/><span>query.sql</span><i/></div><span className="engine-label">PostgreSQL</span><button className="btn btn-ghost btn-sm reset-query" onClick={()=>updateQuery(starter)}><RotateCcw size={15}/>Reset query</button></div>
          <div className="editor-area"><CodeMirror value={query} height="100%" theme="dark" extensions={[sql({dialect:PostgreSQL})]} onChange={updateQuery} basicSetup={{foldGutter:false,highlightActiveLineGutter:false}} onKeyDown={event=>{if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();execute(false)}}}/></div>
        </div>
        <div className="editor-actions"><div><button className="btn run-button" disabled={running} onClick={()=>execute(false)}>{running?<span className="loading loading-spinner loading-sm"/>:<Play size={17} fill="currentColor"/>}Run query<kbd>⌘ ↵</kbd></button><button className="btn btn-primary check-button" disabled={running} onClick={()=>execute(true)}><Check size={18}/>Check answer</button></div><button className="btn btn-ghost btn-sm reset-db" disabled={running} onClick={restoreDatabase} title="Restore the original sample data" aria-label="Reset data"><RotateCcw size={15}/><span>Reset data</span></button></div>
        <div className="results-shell">
          <div className="results-heading"><div><Table2 size={18}/><h2>Query results</h2>{result&&<span className="result-count">{result.rows.length} rows</span>}</div><button className="btn btn-ghost btn-sm" disabled={!result?.fields.length} onClick={copyResults}><Clipboard size={15}/>{copied?'Copied':'Copy CSV'}</button></div>
          <div className={'feedback '+message.kind} role="status" aria-live="polite">{message.kind==='success'?<CheckCircle2 size={18}/>:message.kind==='error'?<Info size={18}/>:<i/>}<span>{message.text}</span></div>
          <div className="results-body">{result?<ResultGrid result={result}/>:<div className="empty-results"><div className="empty-icon"><Code2 size={28}/></div><strong>Results will appear here</strong><span>Run your query to see what the database returns.</span></div>}</div>
        </div>
      </section>
    </main>
  </div>
}
