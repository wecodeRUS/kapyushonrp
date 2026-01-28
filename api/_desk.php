<?php
require_once __DIR__.DIRECTORY_SEPARATOR.'_utils.php';
function _abs_url($base, $rel){
  if(!$rel) return null;
  if(preg_match('/^https?:\/\//i',$rel)) return $rel;
  if(strpos($rel,'//')===0){
    $p=parse_url($base);
    $scheme=isset($p['scheme'])?$p['scheme']:'https';
    return $scheme.':'.$rel;
  }
  $p=parse_url($base);
  $scheme=isset($p['scheme'])?$p['scheme']:'https';
  $host=isset($p['host'])?$p['host']:'';
  if(!$host) return $rel;
  if($rel[0]==='/') return $scheme.'://'.$host.$rel;
  $path=isset($p['path'])?$p['path']:'/';
  $dir=preg_replace('/\/[^\/]*$/','/',$path);
  return $scheme.'://'.$host.$dir.$rel;
}
function _uniq($arr){
  $out=array();
  $seen=array();
  foreach($arr as $x){
    if(!$x) continue;
    $k=strtolower($x);
    if(isset($seen[$k])) continue;
    $seen[$k]=true;
    $out[]=$x;
  }
  return $out;
}

function _scan_text_for_endpoints($pageUrl, $text, $kpat, &$found){
  if(!$text) return;
  $t=_strip_utf8_bom($text);
  $t=str_replace('\\/','/',$t);

  if(preg_match_all('/["\'](\/[^"\']+)["\']/', $t, $m)){
    foreach($m[1] as $p){
      if(stripos($p,'.js')!==false) continue;
      if(stripos($p,'.css')!==false) continue;
      if($kpat && !preg_match('/'.$kpat.'/i',$p)) continue;
      $found[]=_abs_url($pageUrl, $p);
    }
  }

  if(preg_match_all('/["\'](https?:\\/\\/[^"\']+)["\']/', $t, $m2)){
    foreach($m2[1] as $u){
      $uu=str_replace('\\/','/',$u);
      if($kpat && !preg_match('/'.$kpat.'/i',$uu)) continue;
      $found[]=$uu;
    }
  }

  if(preg_match_all('/\\/api\\/[A-Za-z0-9_\-\.\\/\\?=&%:]+/i', $t, $m3)){
    foreach($m3[0] as $p){
      if($kpat && !preg_match('/'.$kpat.'/i',$p)) continue;
      $found[]=_abs_url($pageUrl, $p);
    }
  }
  if(preg_match_all('/\\/graphql\\b[^\s"\']*/i', $t, $m4)){
    foreach($m4[0] as $p){
      if($kpat && !preg_match('/'.$kpat.'/i',$p)) continue;
      $found[]=_abs_url($pageUrl, $p);
    }
  }
}
function _discover_endpoints($pageUrl, $keywords){
  list($code,$html)=_http_get($pageUrl, 12);
  if($code<200 || $code>=400 || !$html) return array();
  $html=_strip_utf8_bom($html);
  $scripts=array();
  if(preg_match_all('/<script[^>]+src=["\']([^"\']+)["\']/i',$html,$m)) $scripts=$m[1];
  $scripts=_uniq($scripts);
  $jsOnly=array();
  foreach($scripts as $s){
    if(stripos($s,'.js')!==false) $jsOnly[]=$s;
  }
  $scripts=array_slice(count($jsOnly)?$jsOnly:$scripts,0,25);
  $found=array();
  $kw=array();
  foreach($keywords as $k){ $kw[]=preg_quote($k,'/'); }
  $kpat=implode('|',$kw);

  if(preg_match_all('/<script(?![^>]*\bsrc=)[^>]*>(.*?)<\/script>/is',$html,$mi)){
    foreach($mi[1] as $inline){
      _scan_text_for_endpoints($pageUrl, $inline, $kpat, $found);
    }
  }
  foreach($scripts as $src){
    $surl=_abs_url($pageUrl,$src);
    if(!$surl) continue;
    list($c,$js)=_http_get($surl, 12, array('Referer: '.$pageUrl));
    if($c<200 || $c>=400 || !$js) continue;
    $js=_strip_utf8_bom($js);
    _scan_text_for_endpoints($pageUrl, $js, $kpat, $found);
    if(preg_match_all('/["\'](\/[A-Za-z0-9_\-\.\/?=&%:]+)["\']/',$js,$mm)){
      foreach($mm[1] as $p){
        if(stripos($p,'.js')!==false) continue;
        if(stripos($p,'.css')!==false) continue;
        if($kpat && !preg_match('/'.$kpat.'/i',$p)) continue;
        $found[]=_abs_url($pageUrl,$p);
      }
    }
    if(preg_match_all('/["\']((?:api|bans|banlist|staff|economy)[A-Za-z0-9_\-\.\/?=&%:]+)["\']/i',$js,$mmr)){
      foreach($mmr[1] as $p){
        if(stripos($p,'.js')!==false) continue;
        if(stripos($p,'.css')!==false) continue;
        if($kpat && !preg_match('/'.$kpat.'/i',$p)) continue;
        $found[]=_abs_url($pageUrl,$p);
        $found[]=_abs_url($pageUrl,'/'.$p);
      }
    }
    if(preg_match_all('/["\'](https?:\/\/[A-Za-z0-9_\-\.\/?=&%:]+)["\']/',$js,$mm2)){
      foreach($mm2[1] as $u){
        if($kpat && !preg_match('/'.$kpat.'/i',$u)) continue;
        $found[]=$u;
      }
    }
  }
  return _uniq($found);
}
function _try_json_urls($urls, $ttlKey, $ttl, $validator=null, $headers=null){
  $c=_cache_get($ttlKey, $ttl);
  if($c) return $c;
  foreach($urls as $u){
    if(!$u) continue;
    list($code,$body)=_http_get($u, 12, $headers);
    if($code<200 || $code>=300 || !$body) continue;
    $body=_strip_utf8_bom($body);
    $d=json_decode($body, true);
    if(!is_array($d)) continue;
    if($validator && is_callable($validator)){
      $ok=false;
      try{ $ok=(bool)call_user_func($validator, $d); }catch(Exception $e){ $ok=false; }
      if(!$ok) continue;
    }
    _cache_set($ttlKey, $d);
    return $d;
  }
  return null;
}

function _pick_list($d, $keys){
  if(!is_array($d)) return null;
  foreach($keys as $k){
    if(isset($d[$k]) && is_array($d[$k])) return $d[$k];
  }
  if(isset($d['response']) && is_array($d['response'])){
    foreach($keys as $k){
      if(isset($d['response'][$k]) && is_array($d['response'][$k])) return $d['response'][$k];
    }
    if(array_values($d['response'])===$d['response']) return $d['response'];
  }
  if(array_values($d)===$d) return $d;
  return null;
}

function _val_bans($d){
  $list=_pick_list($d, array('records','bans','banList','list','data','items'));
  if(!is_array($list)) return false;
  for($i=0;$i<count($list) && $i<5;$i++){
    $it=$list[$i];
    if(!is_array($it)) continue;
    if(isset($it['banTime']) || isset($it['banLength']) || isset($it['reason']) || isset($it['admin']) || isset($it['player'])) return true;
  }
  return count($list)>0;
}
function _val_economy($d){
  $list=_pick_list($d, array('records','economy','players','list','data','items'));
  if(!is_array($list)) return false;
  for($i=0;$i<count($list) && $i<5;$i++){
    $it=$list[$i];
    if(!is_array($it)) continue;
    if(isset($it['money']) || isset($it['balance']) || isset($it['wallet']) || isset($it['steamid']) || isset($it['steamId'])) return true;
  }
  return count($list)>0;
}
function _val_staff($d){
  $list=_pick_list($d, array('records','staff','admins','users','list','data','items'));
  if(!is_array($list)) return false;
  for($i=0;$i<count($list) && $i<5;$i++){
    $it=$list[$i];
    if(!is_array($it)) continue;
    if(isset($it['name']) || isset($it['player']) || isset($it['nick']) || isset($it['priv']) || isset($it['rank']) || isset($it['role'])) return true;
  }
  return count($list)>0;
}
function _fmt_duration($v){
  if($v===0 || $v==='0') return '0м';
  if($v===null || $v==='') return '-';
  if(is_numeric($v)){
    $sec=(int)$v;
    if($sec<0) $sec=0;
    $h=(int)floor($sec/3600);
    $m=(int)floor(($sec%3600)/60);
    if($h>0) return $h.'ч '.$m.'м';
    return $m.'м';
  }
  return (string)$v;
}
function _desk_host(){ return 'https://desk.famerp.ru'; }
function _desk_bans_data(){
  $base=_desk_host();
  $page=$base.'/bans/?page=1';
  $discKey='desk_bans_endpoints';
  $end=_cache_get($discKey, 86400);
  if(!$end){
    $end=_discover_endpoints($page, array('api','ban','bans'));
    $cand=array(
      $base.'/api/bans',
      $base.'/api/bans?page=1',
      $base.'/api/bans?offset=0&limit=50',
      $base.'/api/bans/list?page=1',
      $base.'/api/bans/load?page=1',
      $base.'/api/banlist',
      $base.'/api/banlist?page=1',
      $base.'/api/v1/bans?page=1',
      $base.'/api/v1/banlist?page=1',
      $base.'/api/v2/bans?page=1',
      $base.'/bans?page=1&format=json',
      $base.'/bans/?page=1&format=json',
      $base.'/bans/?page=1&json=1'
    );
    $end=_uniq(array_merge(is_array($end)?$end:array(), $cand));
    _cache_set($discKey, $end);
  }
  $urls=array();
  foreach($end as $u){
    if(stripos($u,'page=')===false && stripos($u,'bans')!==false){
      $urls[]=$u.(strpos($u,'?')===false?'?':'&').'page=1';
      $urls[]=$u;
    }else $urls[]=$u;
  }
  $headers=array(
    'Accept: application/json, text/plain, */*',
    'X-Requested-With: XMLHttpRequest',
    'Referer: '.$page
  );
  $d=_try_json_urls(_uniq($urls), 'desk_bans_json', 60, '_val_bans', $headers);
  return $d;
}
function _desk_staff_data(){
  $base=_desk_host();
  $page=$base.'/bans/?page=1';
  $discKey='desk_staff_endpoints';
  $end=_cache_get($discKey, 86400);
  if(!$end){
    $end=_discover_endpoints($page, array('api','staff','personal','users'));
    $cand=array(
      $base.'/api/staff',
      $base.'/api/staff?page=1',
      $base.'/api/users/staff',
      $base.'/api/personal',
      $base.'/api/admins',
      $base.'/api/admins?page=1',
      $base.'/api/v1/staff',
      $base.'/api/v1/admins'
    );
    $end=_uniq(array_merge(is_array($end)?$end:array(), $cand));
    _cache_set($discKey, $end);
  }
  $urls=array();
  foreach($end as $u){ $urls[]=$u; }
  $headers=array(
    'Accept: application/json, text/plain, */*',
    'X-Requested-With: XMLHttpRequest',
    'Referer: '.$page
  );
  $d=_try_json_urls(_uniq($urls), 'desk_staff_json', 60, '_val_staff', $headers);
  return $d;
}
function _desk_economy_data(){
  $base=_desk_host();
  $page=$base.'/economy/';
  $discKey='desk_eco_endpoints';
  $end=_cache_get($discKey, 86400);
  if(!$end){
    $end=_discover_endpoints($page, array('api','eco','economy','money','rich'));
    $cand=array(
      $base.'/api/economy',
      $base.'/api/economy?page=1',
      $base.'/api/economy?offset=0&limit=200',
      $base.'/api/economy/list?offset=0&limit=200',
      $base.'/api/economy/top?limit=200',
      $base.'/api/rich',
      $base.'/api/money',
      $base.'/api/v1/economy',
      $base.'/api/v2/economy'
    );
    $end=_uniq(array_merge(is_array($end)?$end:array(), $cand));
    _cache_set($discKey, $end);
  }
  $urls=array();
  foreach($end as $u){ $urls[]=$u; }
  $headers=array(
    'Accept: application/json, text/plain, */*',
    'X-Requested-With: XMLHttpRequest',
    'Referer: '.$page
  );
  $d=_try_json_urls(_uniq($urls), 'desk_eco_json', 60, '_val_economy', $headers);
  return $d;
}
function _as_list($d){
  if(!is_array($d)) return array();
  if(isset($d['data']) && is_array($d['data'])) $d=$d['data'];
  if(isset($d['response']) && is_array($d['response'])) $d=$d['response'];
  if(isset($d['records']) && is_array($d['records'])) return $d['records'];
  if(isset($d['items']) && is_array($d['items'])) return $d['items'];
  if(isset($d['result']) && is_array($d['result'])) return $d['result'];
  if(isset($d['list']) && is_array($d['list'])) return $d['list'];
  if(isset($d['bans']) && is_array($d['bans'])) return $d['bans'];
  if(isset($d['banList']) && is_array($d['banList'])) return $d['banList'];
  if(isset($d['staff']) && is_array($d['staff'])) return $d['staff'];
  if(isset($d['admins']) && is_array($d['admins'])) return $d['admins'];
  if(isset($d['users']) && is_array($d['users'])) return $d['users'];
  if(isset($d['players']) && is_array($d['players'])) return $d['players'];
  if(isset($d['economy']) && is_array($d['economy'])) return $d['economy'];
  if(array_values($d)===$d) return $d;
  return array();
}
function desk_bans(){
  $d=_desk_bans_data();
  $list=_as_list($d);
  $out=array();
  foreach($list as $b){
    if(!is_array($b)) continue;
    $player=isset($b['player'])?$b['player']:(isset($b['nick'])?$b['nick']:(isset($b['name'])?$b['name']:''));
    $admin=isset($b['admin'])?$b['admin']:(isset($b['banner'])?$b['banner']:(isset($b['who'])?$b['who']:''));
    $reason=isset($b['reason'])?$b['reason']:(isset($b['cause'])?$b['cause']:(isset($b['text'])?$b['text']:''));
    $date=isset($b['date'])?$b['date']:(isset($b['banTime'])?$b['banTime']:(isset($b['created_at'])?$b['created_at']:(isset($b['createdAt'])?$b['createdAt']:'')));
    $len=isset($b['length'])?$b['length']:(isset($b['banLength'])?$b['banLength']:(isset($b['time'])?$b['time']:(isset($b['duration'])?$b['duration']:'')));
    $steamid=isset($b['steamid'])?$b['steamid']:(isset($b['steamId'])?$b['steamId']:(isset($b['steam'])?$b['steam']:''));
    $status=isset($b['status'])?$b['status']:'';
    $out[]=array(
      'player'=>$player,
      'admin'=>$admin,
      'reason'=>$reason,
      'date'=>$date,
      'length'=>$len,
      'steamid'=>$steamid,
      'status'=>$status
    );
  }
  return $out;
}
function desk_staff(){
  $d=_desk_staff_data();
  $list=_as_list($d);
  $out=array();
  foreach($list as $p){
    if(!is_array($p)) continue;
    $name=isset($p['name'])?$p['name']:(isset($p['nick'])?$p['nick']:(isset($p['nickname'])?$p['nickname']:(isset($p['player'])?$p['player']:'')));
    $role=isset($p['role'])?$p['role']:(isset($p['rank'])?$p['rank']:(isset($p['group'])?$p['group']:(isset($p['position'])?$p['position']:'')));
    $play=isset($p['playtime'])?$p['playtime']:(isset($p['played'])?$p['played']:(isset($p['time'])?$p['time']:(isset($p['hours'])?$p['hours']:'')));
    $last=isset($p['last_seen'])?$p['last_seen']:(isset($p['lastSeen'])?$p['lastSeen']:(isset($p['last'])?$p['last']:(isset($p['last_join'])?$p['last_join']:(isset($p['lastJoin'])?$p['lastJoin']:''))));
    $online=isset($p['online'])?$p['online']:(isset($p['isOnline'])?$p['isOnline']:(isset($p['status'])?$p['status']:null));
    $on=false;
    if(is_bool($online)) $on=$online;
    if(is_string($online)) $on=strtolower($online)==='online' || strtolower($online)==='true' || _lower($online)==='в сети';
    if(!$on && is_string($last)) $on=_lower($last)==='в сети';
    $out[]=array(
      'name'=>$name,
      'role'=>$role,
      'playtime'=>_fmt_duration($play),
      'last_seen'=>$last,
      'online'=>$on
    );
  }
  return $out;
}
function desk_economy(){
  $d=_desk_economy_data();
  $list=_as_list($d);
  $out=array();
  foreach($list as $p){
    if(!is_array($p)) continue;
    $name=isset($p['nickname'])?$p['nickname']:(isset($p['nick'])?$p['nick']:(isset($p['name'])?$p['name']:''));
    $steamid=isset($p['steamid'])?$p['steamid']:(isset($p['steamId'])?$p['steamId']:(isset($p['steam'])?$p['steam']:''));
    $money=isset($p['money'])?$p['money']:(isset($p['cash'])?$p['cash']:(isset($p['balance'])?$p['balance']:0));
    $play=isset($p['playtime'])?$p['playtime']:(isset($p['played'])?$p['played']:(isset($p['time'])?$p['time']:(isset($p['hours'])?$p['hours']:'')));
    $out[]=array(
      'nickname'=>$name,
      'steamid'=>$steamid,
      'money'=>$money,
      'playtime'=>$play
    );
  }
  return $out;
}
