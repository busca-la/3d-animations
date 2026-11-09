import React, { useState } from 'react';
import { Check, CreditCard, ShieldCheck, ArrowRight, Copy, Layers3, Film, Building2, AlertCircle, Clock3 } from 'lucide-react';

const offers = [
  {
    id:'livre', title:'Explorar', audience:'Para testar o software', label:'Beta aberta',
    items:['Criar cidades com descrição','Prévia 3D navegável','Biblioteca local e download GLB','Narração brasileira no navegador'],
  },
  {
    id:'creator', title:'Creator', audience:'Para criadores de vídeo', label:'Plano em preparação',
    items:['Cidades e cenários para produções','Exportações de trabalho em GLB','Diretor 3D e narração integrados','Fluxo de projetos e biblioteca'],
  },
  {
    id:'studio', title:'Studio', audience:'Para equipes e estúdios', label:'Plano em preparação',
    items:['Ferramentas de produção profissional','Futuros projetos sincronizados','Gestão futura de equipe','Recursos comerciais para estúdios'],
  },
];

export default function PlansStudio({onTryCity}) {
  const [feedback,setFeedback]=useState('');
  async function copyOffer(offer){
    const text='Vitor Productions 3D Studio — plano '+offer.title+'\n'+offer.items.map(v=>'• '+v).join('\n')+'\nPreço e disponibilidade: em definição. Cobrança não ativada.';
    try {
      await navigator.clipboard.writeText(text);
      setFeedback('Descrição do plano '+offer.title+' copiada.');
    } catch {setFeedback('Não foi possível copiar. Verifique as permissões do navegador.');}
  }
  return <div className="plans-page">
    <header className="plans-header">
      <div className="section-kicker">VITOR PRODUCTIONS / MODELO DE NEGÓCIO</div>
      <h1>Um estúdio 3D que <span className="studio-heading-accent">pode crescer</span></h1>
      <p>Estamos organizando a versão comercial do software. O gerador pode ser utilizado nesta beta; assinaturas pagas ainda não estão disponíveis.</p>
    </header>
    <div className="plans-grid">
      {offers.map((offer,index)=><article className={'plans-card '+(index===1?'plans-featured':'')} key={offer.id}>
        <div className="plans-head"><span className="plans-icon">{index===0?<Building2 size={20}/>:index===1?<Film size={20}/>:<Layers3 size={20}/>}</span><span className="plans-status">{offer.label}</span></div>
        <h2>{offer.title}</h2>
        <p>{offer.audience}</p>
        <div className="plans-price">{index===0?'Gratuito durante a beta':'Preço a definir'}</div>
        <ul>{offer.items.map(item=><li key={item}><Check size={15}/>{item}</li>)}</ul>
        {index===0 ? <button className="plans-action plans-primary" onClick={onTryCity}>Criar minha cidade <ArrowRight size={17}/></button> :
          <button className="plans-action" onClick={()=>copyOffer(offer)}>Copiar apresentação <Copy size={16}/></button>}
      </article>)}
    </div>
    <section className="plans-notice">
      <ShieldCheck size={25}/>
      <div>
        <h2>Pagamentos ainda não ativados</h2>
        <p>Não há cobranças, renovação automática ou contas premium ativas. Para vender assinaturas de verdade, precisamos integrar autenticação, permissões no servidor, cobrança recorrente, gestão de cancelamentos e um provedor de pagamentos com titular responsável pela empresa.</p>
      </div>
    </section>
    <div className="plans-next">
      <h2>Pronto na base do software</h2>
      <div><span><Check size={16}/> Geração e exportação 3D</span><span><Check size={16}/> Interface de planos</span><span><Clock3 size={16}/> Pagamento recorrente e autenticação comercial: pendentes</span></div>
    </div>
    {feedback&&<p className="plans-feedback" role="status">{feedback}</p>}
  </div>;
}
