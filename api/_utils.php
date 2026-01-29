<?php
error_reporting(0);
@ini_set('display_errors','0');
@ini_set('display_startup_errors','0');
function _lower($s){
  if($s===null) return '';
  if(function_exists('mb_strtolower')) return mb_strtolower((string)$s,'UTF-8');
  return strtolower((string)$s);
}
function _json($data){
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
  exit;
}
function _cache_dir(){
  $d=__DIR__.DIRECTORY_SEPARATOR.'..'.DIRECTORY_SEPARATOR.'cache';
  if(!is_dir($d)) @mkdir($d, 0755, true);
  if(is_dir($d) && is_writable($d)) return realpath($d);
  $t=sys_get_temp_dir().DIRECTORY_SEPARATOR.'kapyushonrp_cache';
  if(!is_dir($t)) @mkdir($t, 0755, true);
  return $t;
}
function _cache_get($key, $ttl){
  $f=_cache_dir().DIRECTORY_SEPARATOR.sha1($key).'.json';
  if(!is_file($f)) return null;
  $age=time()-filemtime($f);
  if($age>$ttl) return null;
  $raw=@file_get_contents($f);
  if($raw===false) return null;
  $d=json_decode($raw, true);
  return is_array($d)?$d:null;
}
function _cache_set($key, $data){
  $f=_cache_dir().DIRECTORY_SEPARATOR.sha1($key).'.json';
  @file_put_contents($f, json_encode($data, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
}

function _cookie_jar(){
  $d=_cache_dir();
  $f=$d.DIRECTORY_SEPARATOR.'cookies.txt';
  if(!is_file($f)) @file_put_contents($f, '');
  return $f;
}

function _push_path($name){
  return _cache_dir().DIRECTORY_SEPARATOR.'push_'.$name.'.json';
}
function _push_get($name, $ttl){
  $p=_push_path($name);
  if(!is_file($p)) return null;
  $age=time()-@filemtime($p);
  if($age>$ttl) return null;
  $raw=@file_get_contents($p);
  if($raw===false) return null;
  $j=@json_decode($raw,true);
  return is_array($j)?$j:null;
}
function _push_set($name, $data){
  $p=_push_path($name);
  @file_put_contents($p, json_encode($data, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
  return true;
}
function _http_get($url, $timeout=8, $headers=null){
  $ch=curl_init();
  curl_setopt($ch, CURLOPT_URL, $url);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
  curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, $timeout);
  curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
  curl_setopt($ch, CURLOPT_ENCODING, '');
  curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
  curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
  $h=array('Accept: */*', 'Accept-Language: ru-RU,ru;q=0.9,en;q=0.5', 'Cache-Control: no-cache');
  if(is_array($headers) && count($headers)>0) $h=array_merge($h, $headers);
  curl_setopt($ch, CURLOPT_HTTPHEADER, $h);
  $cj=_cookie_jar();
  curl_setopt($ch, CURLOPT_COOKIEFILE, $cj);
  curl_setopt($ch, CURLOPT_COOKIEJAR, $cj);
  $body=curl_exec($ch);
  $code=curl_getinfo($ch, CURLINFO_HTTP_CODE);
    return array($code, $body);
}
function _fetch_json_cached($key, $url, $ttl){
  $c=_cache_get($key, $ttl);
  if($c) return $c;
  list($code,$body)=_http_get($url);
  if($code<200 || $code>=300 || !$body) return null;
  $d=json_decode($body, true);
  if(!is_array($d)) return null;
  _cache_set($key, $d);
  return $d;
}
function _strip_utf8_bom($s){
  if(substr($s,0,3)==="\xEF\xBB\xBF") return substr($s,3);
  return $s;
}
