# Atlas implementation contract
All endpoints under /api, JSON unless stated. IDs are strings. Datetimes ISO UTC. Cookie session. Errors {detail:string}. Backend static serves web/ at /.

- GET /health => {status:'ok',mode:'local',version:'1.0.0'}
- GET /session => {user:{id,name,email,role}|null, demo:true}
- POST /auth/login {email,password} => {user}; POST /auth/demo {role:'manager'|'author'|'reviewer'|'admin'} => {user} (only demo mode); POST /auth/logout
- GET /dashboard => {documents:[Document],activity:[Audit],users:[User],settings:Settings,rules:[Rule],feedback:[Feedback]}
- GET /documents => [Document]. Document: {id,title,filename,category,owner_id,owner_name,assigned_to,visibility:'team'|'private',status:'draft'|'in_review'|'approved'|'needs_changes',score:number|null,version:number,created_at,updated_at,content:string,report:Report|null,versions:[Version]}. Version: {version,content,created_at,author_name,note,report}. List can omit versions.
- POST /documents multipart {file,title?,category?,visibility?} => Document. PDF/DOCX/TXT/MD only; max 10MB.
- POST /documents/text {title,content,category,visibility?} => Document
- GET /documents/{id} => Document
- PATCH /documents/{id} {content?,title?,visibility?,assigned_to?,note?} => Document; new content creates immutable version, clears approval and score.
- POST /documents/{id}/analyze {} => Document with report
- POST /documents/{id}/review {decision:'submit'|'approve'|'request_changes',comment?:string} => Document. Approval must meet score threshold, no failed critical rules, current policy/version.
- GET /documents/{id}/export?format=pdf|txt&version=N => file; GET /documents/{id}/original => original upload file.
- GET /rules => [Rule]; POST /rules RuleInput => Rule; PUT /rules/{id} RuleInput => Rule; DELETE /rules/{id}
Rule: {id,name,description,category:'All'|'SOP'|'Quality'|'Regulatory'|'General',type:'required_text'|'prohibited_text'|'min_words'|'required_sections',value:string,weight:number,severity:'critical'|'major'|'minor',enabled:boolean,suggestion:string}. RuleInput same minus id. Required sections comma-separated.
Report: {score:number,passed:number,failed:number,total:number,eligible:boolean,threshold:number,policy_version:number,checked_at:string,findings:[Finding]}; Finding: {rule_id,name,severity,passed,weight,evidence:string,suggestion:string,type,value}
- GET /settings => Settings; PUT /settings {threshold?,retrieval_limit?,learning_enabled?} => Settings
Settings: {threshold:85,retrieval_limit:5,learning_enabled:true,policy_version:1}
- GET /users => [User]; POST /users {name,email,role,password} => User; PATCH /users/{id} {role?,active?} => User (admin only). User {id,name,email,role,active}
- GET /audit => [Audit {id,action,actor_name,document_id,document_title,details,created_at}]
- POST /knowledge/ask {question,scope:'approved'|'all'} => {answer,mode:'extractive'|'llm',sources:[{document_id,title,version,excerpt,score,page?:number}],message?}; access filter BEFORE retrieval. approved default. all = accessible documents.
- POST /feedback {document_id,rule_id,correction,comment?} => Feedback; GET /feedback => [Feedback]; POST /feedback/{id}/review {decision:'approve'|'reject'} => Feedback
Feedback: {id,document_id,rule_id,correction,comment,status:'pending'|'approved'|'rejected',author_name,created_at}. Approved feedback provides correction suggestions only; never silently changes rules.
- GET /learning => {approved_count,pending_count,suggestions:[Feedback]}

Roles: author own docs and approved team docs; reviewer team + assigned docs; manager/admin all docs. Author can edit own draft/needs_changes; reviewer can edit accessible not-approved; manager/admin can edit. Only reviewer/manager/admin approve; never own document. Manager/admin rules/settings/feedback approval. Admin user administration. No deletion of documents in v1.

Demo: Backend seeds sample documents and four personas, /auth/demo available default local demo; ATLAS_DEMO_MODE=0 disables demo routes, sample accounts/data must not be auto-created and bootstraps admin via ATLAS_ADMIN_EMAIL/PASSWORD. UI clearly badges demo. New local install default demo for easy use. Real backend must enforce all permissions independently of UI.
