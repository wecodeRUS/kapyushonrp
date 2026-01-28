<?php
require_once __DIR__.DIRECTORY_SEPARATOR.'_desk.php';

$targets=array(
  'bans'=>array(
    'page'=>'https://desk.famerp.ru/bans/?page=1',
    'keywords'=>array('ban','bans','banlist','punishment','punishments','desk','api')
  ),
  'staff'=>array(
    'page'=>'https://desk.famerp.ru/bans/?page=1',
    'keywords'=>array('staff','admins','admin','moderator','mod','team','role','api')
  ),
  'economy'=>array(
    'page'=>'https://desk.famerp.ru/economy/',
    'keywords'=>array('economy','money','balance','top','steam','player','api')
  )
);

$out=array('ok'=>true,'time'=>time(),'targets'=>array());

foreach($targets as $name=>$cfg){
  $page=$cfg['page'];
  list($pc,$html)=_http_get($page, 12, array('Referer: https://desk.famerp.ru/'));
  $endpoints=_discover_endpoints($page, $cfg['keywords']);
  $checks=array();
  $headers=array(
    'Accept: application/json, text/plain, */*',
    'X-Requested-With: XMLHttpRequest',
    'Referer: '.$page
  );
  $i=0;
  foreach($endpoints as $u){
    if($i>=8) break;
    list($code,$body)=_http_get($u, 10, $headers);
    $checks[]=array('url'=>$u,'code'=>$code,'bytes'=>is_string($body)?strlen($body):0);
    $i++;
  }
  $out['targets'][$name]=array(
    'page'=>$page,
    'page_status'=>$pc,
    'page_bytes'=>is_string($html)?strlen($html):0,
    'endpoints_found'=>count($endpoints),
    'sample_checks'=>$checks
  );
}

_json($out);
