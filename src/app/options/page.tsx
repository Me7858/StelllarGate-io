"use client";

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PayoffDiagram } from "../../components/PayoffDiagram";
import { VolSmile } from "../../components/VolSmile";
import { AppHeader } from "../../components/AppHeader";
import { WalletConnect } from "../../components/WalletConnect";
import { MARKETS, EXPIRIES, bs, smileVol, seededRandom, fmtN, fmtSpot, fmtK, type Greeks } from "../../lib/pricing";
import { getExpiryCalendar } from "../../lib/api/market";
import { ApiError } from "../../lib/api/client";
import { useBackendData } from "../../lib/context/BackendDataContext";
import { useSpotFeedContext } from "../../lib/context/SpotFeedContext";
import { useWalletStore } from "../../lib/store/wallet";
import { collateralRequired } from "../../lib/collateral";
import { AlertsPanel } from "../../components/AlertsPanel";
import { StarButton } from "../../components/StarButton";
import { SpotPriceChart } from "../../components/SpotPriceChart";
import { usePriceHistory } from "../../lib/usePriceHistory";
import { useHydrated } from "../../lib/useHydrated";
import { parseTerminalUrl, buildShareUrl, type TerminalUrlState, type ViewTab } from "../../lib/urlState";
import { useUrlState } from "../../lib/useUrlState";
import { StrategyPicker } from "../../components/StrategyPicker";
import { MultiLegPayoffDiagram } from "../../components/MultiLegPayoffDiagram";
import { VolSurfaceHeatmap } from "../../components/VolSurfaceHeatmap";
import { ChainRow as ChainRowView } from "../../components/ChainRow";
import { useChainFeed } from "../../lib/hooks/useChainFeed";
import { useStrategyQuote, quoteMove } from "../../lib/hooks/useStrategyQuote";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { STRATEGY_TEMPLATES, type StrategyTemplate } from "../../lib/strategies";
import { netPremium, type PricedLeg } from "../../lib/payoff";
import type { ChainRowData } from "../../lib/chainRows";
import { useOptionChain, useExpiries } from "./_components/useOptionChain";
import { MarketHeader } from "./_components/MarketHeader";
import { MarketSidebar } from "./_components/MarketSidebar";
import { ViewTabs } from "./_components/ViewTabs";
import { ChainTable } from "./_components/ChainTable";
import { PositionsTab } from "./_components/PositionsTab";
import { StrategiesTab } from "./_components/StrategiesTab";
import { SurfaceTab } from "./_components/SurfaceTab";
import { PortfolioBar } from "./_components/PortfolioBar";
import { TradeTicket } from "./_components/TradeTicket";
import { StatusBar } from "./_components/StatusBar";
import type { TradeState, ViewTab } from "./_components/types";

type ChainRow=ChainRowData;
// Net premium moving more than this since the confirm dialog opened requires re-confirmation.
const QUOTE_REQUIRE_RECONFIRM=0.02;

export default function OptionsPage() {
  return (
    <Suspense fallback={null}>
      <OptionsPageContent />
    </Suspense>
  );
}

// Composition shell: each feature module owns its own state and data hooks.
function OptionsPageContent() {
  const params = useSearchParams();
  const initialUrl = useMemo(()=>parseTerminalUrl(params),[]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sym, setSym] = useState(initialUrl.u);
  const [expiry, setExpiry] = useState(EXPIRIES.find(e=>e.days===initialUrl.exp)??EXPIRIES[2]);
  // Live from the shared WebSocket feed (SpotFeedProvider, mounted at
  // the root) — null until the first message arrives or if the socket's
  // still reconnecting, in which case the static seed constants below
  // are what render instead.
  const { data: spotData } = useSpotFeedContext();
  const prov = useSpotProvenance();
  const [trade, setTrade] = useState<TradeState|null>(null);
  const [contracts, setContracts] = useState("1");
  const [viewTab, setViewTab] = useState<ViewTab>("chain");
  const market = MARKETS.find(m=>m.sym===sym)??MARKETS[0];
  const spot = spotData?.prices[sym] ?? market.price;
  const vol = spotData?.vols[sym] ?? market.vol;
  const expiries = useExpiries(sym);
  const { chain, loading: chainLoading } = useOptionChain(sym, expiry.days, spot, vol);
  const priceHistory = usePriceHistory(sym, spot);
  const [contracts, setContracts] = useState(String(initialUrl.qty));
  const [viewTab, setViewTab] = useState<ViewTab>(initialUrl.tab);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyTemplate|null>(
    STRATEGY_TEMPLATES.find(t=>t.id===initialUrl.strategy)??null);
  const [focusStrike, setFocusStrike] = useState<number|null>(initialUrl.strike);
  const urlSnapshot: TerminalUrlState = {
    u:sym, exp:expiry.days, tab:viewTab, strategy:selectedStrategy?.id??null,
    qty:Math.max(1,Math.round(parseFloat(contracts)||1)), strike:trade?.row.strike??focusStrike,
  };
  useUrlState(urlSnapshot, next=>{
    setSym(next.u);
    setExpiry(EXPIRIES.find(e=>e.days===next.exp)??EXPIRIES[2]);
    setViewTab(next.tab);
    setSelectedStrategy(STRATEGY_TEMPLATES.find(t=>t.id===next.strategy)??null);
    setContracts(String(next.qty));
    setFocusStrike(next.strike);
  });
  const [linkCopied, setLinkCopied] = useState(false);
  const copyLink = () => {
    const url = buildShareUrl(window.location.origin, window.location.pathname, urlSnapshot);
    navigator.clipboard?.writeText(url).then(()=>{setLinkCopied(true);setTimeout(()=>setLinkCopied(false),1500)}).catch(()=>{});
  };
  const [showStrategyConfirm, setShowStrategyConfirm] = useState(false);
  const prevSpotRef = useRef(spot);

  const t = expiry.days/365;

  // Standard "previous value" pattern: this effect runs after the
  // render that already shows the current `spot`, so the ref always
  // holds what was rendered last time — which is exactly what
  // `priceDir` below needs to compare against.
  useEffect(()=>{
    prevSpotRef.current=spot;
  },[spot]);

  const sortedMarkets=useMemo(()=>{
    if(!hydrated)return MARKETS; // matches SSR order until this component's own mount effect fires
    return [...MARKETS].sort((a,b)=>{
      const aFav=favorites.includes(a.sym),bFav=favorites.includes(b.sym);
      return aFav===bFav?0:aFav?-1:1;
    });
  },[favorites,hydrated]);

  // Chain rows are stream-driven (or visibility-aware polling) — see
  // useChainFeed. The local BS chain below is only the offline fallback.
  const [chainFallback,setChainFallback]=useState(false);
  const {chain,loading:chainLoading,mode:chainMode}=useChainFeed(sym,expiry.days,()=>
    Array.from({length:21},(_,i)=>{
      const n=i-10;
      const strike=Math.round(spot*(1+n*0.04)*10000)/10000;
      const v=smileVol(vol,strike/spot);
      return{strike,call:bs(spot,strike,v,t,true),put:bs(spot,strike,v,t,false),
        itmCall:spot>strike,itmPut:spot<strike};
    }));
  const priceDegraded=prov.degraded||chainFallback;
  const priceSource=chainFallback?"fallback-model" as const:prov.source;
  const openTrade=useCallback((row:ChainRow,side:"call"|"put",mode:"buy"|"write")=>setTrade({row,side,mode}),[]);

  // Backend positions don't store per-position Greeks (only the entry
  // premium/spot) — GET /api/v1/portfolio/greeks gives the aggregate, but
  // the per-row columns in the table below need a live figure for each
  // position individually, so this recomputes them the same way
  // /api/v1/portfolio/greeks does server-side: reprice at current
  // spot/vol for that position's own underlying, same static
  // expiry_days-as-t simplification the backend uses for closing.
  const positionLiveGreeks=(pos:{underlying:string;strike:number;expiry_days:number;option_type:"call"|"put"})=>{
    const posSpot=spotData?.prices[pos.underlying]
      ?? MARKETS.find(m=>m.sym===pos.underlying)?.price ?? spot;
    const posVol=spotData?.vols[pos.underlying]
      ?? MARKETS.find(m=>m.sym===pos.underlying)?.vol ?? vol;
    const posT=pos.expiry_days/365;
    const v=smileVol(posVol,pos.strike/posSpot);
    return bs(posSpot,pos.strike,v,posT,pos.option_type==="call");
  };

  const atmIdx=chain.findIndex(r=>!r.itmCall);
  const tradeGreeks=trade?(trade.side==="call"?trade.row.call:trade.row.put):null;

  const qty=Math.max(0.01,parseFloat(contracts)||1);

  // Local Black-Scholes pricing of the strategy legs (static seed vol) —
  // only the offline fallback / initial placeholder for useStrategyQuote,
  // which prices from the live chain snapshot or the backend /price endpoint.
  const localLegs=useMemo(():PricedLeg[]=>{
    if(!selectedStrategy)return[];
    return selectedStrategy.legs.map(leg=>{
      const strike=Math.round(spot*leg.strikeOffset*10000)/10000;
      const legVol=smileVol(market.vol,leg.strikeOffset);
      const greeks=bs(spot,strike,legVol,t,leg.side==="call");
      return{side:leg.side,action:leg.action,strike,contracts:qty,greeks};
    });
  },[selectedStrategy,spot,market.vol,t,qty]);
  const {legs:pricedLegs,netPremium:strategyNetPremium,asOf:quoteAsOf,source:quoteSource,loading:quoteLoading}=useStrategyQuote({
    template:selectedStrategy,sym,expiryDays:expiry.days,qty,spot,chain,chainIsLive:chainMode!=="fallback",localLegs,
  });
  const [quotedNet,setQuotedNet]=useState<number|null>(null);
  const quoteMoved=showStrategyConfirm&&quotedNet!==null&&quoteMove(quotedNet,strategyNetPremium)>QUOTE_REQUIRE_RECONFIRM;
  const quoteLabel=quoteSource==="local"?"local estimate (offline fallback)":quoteSource==="chain"?"chain":"backend";
  const quoteTime=quoteAsOf?new Date(quoteAsOf).toLocaleTimeString([],{hour12:false}):"—";
  const strategyCollateral=useMemo(()=>pricedLegs.reduce((sum,leg)=>
    leg.action==="sell"?sum+collateralRequired(leg.side,leg.contracts,leg.strike,spot):sum,0
  ),[pricedLegs,spot]);
  const strategyRequiredFunds=strategyCollateral+Math.max(0,strategyNetPremium);
  const strategyInsufficientFunds=pricedLegs.length>0&&balance<strategyRequiredFunds;
  const collateral=trade&&trade.mode==="write"?collateralRequired(trade.side,qty,trade.row.strike,spot):0;
  const requiredFunds=trade?(trade.mode==="write"?collateral:(tradeGreeks?.premium??0)*qty):0;
  const insufficientFunds=balance<requiredFunds;
  const notSignedIn=!token;

  const execTrade=async()=>{
    if(!trade||!tradeGreeks||insufficientFunds||submitting)return;
    setSubmitting(true);
    setTradeError(null);
    try{
      await openBackendPosition({
        underlying:sym,strike:trade.row.strike,expiryDays:expiry.days,
        optionType:trade.side,positionType:trade.mode==="write"?"short":"long",contracts:qty,
      });
      setTrade(null);
      setShowTradeConfirm(false);
      setViewTab("positions");
    }catch(err){
      setTradeError(err instanceof ApiError?err.message:"Failed to open position");
    }finally{
      setSubmitting(false);
    }
  };

  const execStrategy=async()=>{
    if(!selectedStrategy||pricedLegs.length===0||strategyInsufficientFunds||submitting)return;
    setSubmitting(true);
    setTradeError(null);
    try{
      await openBackendStrategy(pricedLegs.map(leg=>({
        underlying:sym,strike:leg.strike,expiryDays:expiry.days,
        optionType:leg.side,positionType:leg.action==="buy"?"long":"short",contracts:leg.contracts,
      })));
      setSelectedStrategy(null);
      setShowStrategyConfirm(false);
      setViewTab("positions");
    }catch(err){
      setTradeError(err instanceof ApiError?err.message:"Failed to execute strategy");
    }finally{
      setSubmitting(false);
    }
  };

  const priceDir = spot >= prevSpotRef.current;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"var(--bg)",overflow:"hidden",fontFamily:"var(--font-sans)"}}>
      <MarketHeader sym={sym} setSym={setSym} spot={spot} vol={vol} market={market}
        expiries={expiries} expiry={expiry} setExpiry={setExpiry}/>

      <div style={{flex:1,display:"flex",overflow:"hidden",minHeight:0}}>
        <MarketSidebar sym={sym} spot={spot} vol={vol}/>

        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",minWidth:0}}>
          <ViewTabs viewTab={viewTab} setViewTab={setViewTab} sym={sym} expiryLabel={expiry.label} strikes={chain.length}/>
          {viewTab==="chain"&&<ChainTable chain={chain} chainLoading={chainLoading} setTrade={setTrade}/>}
          {viewTab==="positions"&&<PositionsTab spot={spot} vol={vol} onBack={()=>setViewTab("chain")}/>}
          {viewTab==="strategies"&&(
            <StrategiesTab sym={sym} expiryDays={expiry.days} spot={spot} marketVol={market.vol} qty={qty}
              onExecuted={()=>setViewTab("positions")}/>
          )}
          )}
          {viewTab==="surface"&&<SurfaceTab vol={vol} expiryDays={expiry.days}/>}
          <PortfolioBar/>
        </div>
          )}
          {viewTab==="surface"&&<SurfaceTab vol={vol} expiryDays={expiry.days}/>}
          <PortfolioBar/>
        </div>

        <TradeTicket trade={trade} sym={sym} expiry={expiry} spot={spot}
          contracts={contracts} setContracts={setContracts}
          onClose={()=>setTrade(null)}
          onExecuted={()=>{setTrade(null);setViewTab("positions");}}/>
      </div>

      <StatusBar strikes={chain.length}/>

      {showTradeConfirm&&trade&&tradeGreeks&&(
        <ConfirmDialog
          title={`${trade.mode==="write"?"Write":"Buy"} ${sym} ${trade.side.toUpperCase()}`}
          confirmLabel={submitting?"Submitting…":`Confirm ${trade.mode==="write"?"Write":"Buy"}`}
          onConfirm={execTrade}
          onCancel={()=>setShowTradeConfirm(false)}
          disabled={insufficientFunds||notSignedIn||submitting||!!tradeError}
          disabledReason={tradeError??(insufficientFunds?`Insufficient balance ${trade.mode==="write"?"to post collateral":"to cover premium"}.`:undefined)}
        >
          {[
            ["Strike",fmtK(trade.row.strike)],
            ["Expiry",expiry.label],
            ["Contracts",String(qty)],
            [trade.mode==="write"?"Premium received":"Total premium",`$${fmtN(tradeGreeks.premium*qty,2)}`],
            ...(trade.mode==="write"?[["Collateral required",`$${fmtN(collateral,2)}`]]:[]),
          ].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:12}}>
              <span style={{color:"var(--text-lo)"}}>{k}</span>
              <span className="num" style={{color:"var(--text-hi)"}}>{v}</span>
            </div>
          ))}
        </ConfirmDialog>
      )}

      {showStrategyConfirm&&selectedStrategy&&(
        <ConfirmDialog
          title={`Execute ${selectedStrategy.name}`}
          confirmLabel={submitting?"Submitting…":quoteMoved?"Accept new quote":"Confirm Execute"}
          onConfirm={()=>{if(quoteMoved)setQuotedNet(strategyNetPremium);else execStrategy();}}
          onCancel={()=>setShowStrategyConfirm(false)}
          disabled={strategyInsufficientFunds||notSignedIn||submitting||!!tradeError||(quoteLoading&&!quoteMoved)}
          disabledReason={tradeError??(strategyInsufficientFunds?`Insufficient balance — needs $${fmtN(strategyRequiredFunds,2)}, have $${fmtN(balance,2)}.`:notSignedIn?"Connect your wallet to trade.":undefined)}
        >
          {pricedLegs.map((leg,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:12}}>
              <span style={{color:leg.action==="buy"?"var(--call)":"var(--put)",textTransform:"uppercase"}}>{leg.action} {leg.side}</span>
              <span className="num" style={{color:"var(--text-mid)"}}>K={fmtK(leg.strike)}</span>
              <span className="num" style={{color:"var(--text-hi)"}}>${fmtN(leg.greeks.premium*leg.contracts,2)}</span>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0 0",marginTop:6,borderTop:"1px solid var(--border-default)",fontSize:12}}>
            <span style={{color:"var(--text-lo)"}}>{strategyNetPremium>=0?"Net Debit":"Net Credit"}</span>
            <span className="num" style={{color:"var(--text-hi)"}}>${fmtN(Math.abs(strategyNetPremium),2)}</span>
          </div>
          <div className="num" style={{padding:"4px 0",fontSize:10,color:quoteSource==="local"?"var(--put)":"var(--text-lo)"}}>
            Quote as of {quoteTime} · {quoteLabel}
          </div>
          {quoteMoved&&quotedNet!==null&&(
            <div style={{margin:"6px 0",padding:"6px 8px",fontSize:11,color:"var(--put)",border:"1px solid var(--put)"}}>
              Quote moved: net {quotedNet>=0?"debit":"credit"} ${fmtN(Math.abs(quotedNet),2)} → {strategyNetPremium>=0?"debit":"credit"} ${fmtN(Math.abs(strategyNetPremium),2)}. Review and accept the new quote to continue.
            </div>
          )}
          {strategyCollateral>0&&(
            <div style={{display:"flex",justifyContent:"space-between",padding:"4px 0",fontSize:12}}>
              <span style={{color:"var(--text-lo)"}}>Collateral Required</span>
              <span className="num" style={{color:"var(--text-hi)"}}>${fmtN(strategyCollateral,2)}</span>
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
