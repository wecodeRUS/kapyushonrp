<?php
require_once __DIR__.DIRECTORY_SEPARATOR.'_utils.php';

function _a2s_recv_full($socket, $timeout=2){
  $packets=array();
  $id=null;
  $total=null;
  $start=microtime(true);
  while(true){
    if((microtime(true)-$start)>$timeout) break;
    $buf=@stream_socket_recvfrom($socket, 8192);
    $meta=@stream_get_meta_data($socket);
    if($buf===false || $buf===''){
      if(is_array($meta) && !empty($meta['timed_out'])) break;
      continue;
    }

    if(strlen($buf)<5) continue;
    $hdr=unpack('V', substr($buf,0,4))[1];

    if($hdr===0xFFFFFFFF){
      return substr($buf,4);
    }

    if($hdr===0xFFFFFFFE){
      if(strlen($buf)<12) continue;
      $pid=unpack('V', substr($buf,4,4))[1];
      $tot=ord($buf[8]);
      $num=ord($buf[9]);
      $payload=substr($buf, 12);

      if($id===null){ $id=$pid; $total=$tot; }
      if($pid!==$id) continue;
      $packets[$num]=$payload;

      if($total!==null && count($packets)>=$total){
        ksort($packets);
        $all='';
        foreach($packets as $p){ $all.=$p; }
        if(substr($all,0,4)==="\xFF\xFF\xFF\xFF") $all=substr($all,4);
        return $all;
      }
    }
  }
  return null;
}

function _a2s_query($ip, $port, $payload, $timeout=2){
  $socket=@stream_socket_client('udp://'.$ip.':'.$port, $errno, $errstr, $timeout);
  if(!$socket) return null;
  stream_set_timeout($socket, $timeout);
  @stream_socket_sendto($socket, $payload);
  $data=_a2s_recv_full($socket, $timeout);
  fclose($socket);
  return $data;
}

function _a2s_read_cstring($data, &$o){
  $len=strlen($data);
  if($o>=$len) return '';
  $pos=strpos($data, "\0", $o);
  if($pos===false){
    $s=substr($data,$o);
    $o=$len;
    return $s;
  }
  $s=substr($data,$o,$pos-$o);
  $o=$pos+1;
  return $s;
}

function a2s_info($ip, $port, $timeout=2){
  $req="\xFF\xFF\xFF\xFFTSource Engine Query\x00";
  $data=_a2s_query($ip,$port,$req,$timeout);
  if(!$data || strlen($data)<2) return null;
  $o=0;
  $type=ord($data[$o]);
  $o++;
  if($type!==0x49 && $type!==0x6D) return null;
  $protocol=ord($data[$o]);
  $o++;
  $name=_a2s_read_cstring($data,$o);
  $map=_a2s_read_cstring($data,$o);
  $folder=_a2s_read_cstring($data,$o);
  $game=_a2s_read_cstring($data,$o);
  if($o+2>strlen($data)) return null;
  $id=unpack('v', substr($data,$o,2))[1];
  $o+=2;
  if($o+3>strlen($data)) return null;
  $players=ord($data[$o]);
  $max=ord($data[$o+1]);
  $bots=ord($data[$o+2]);
  return array(
    'name'=>$name,
    'map'=>$map,
    'players'=>$players,
    'max'=>$max,
    'bots'=>$bots,
    'protocol'=>$protocol,
    'game'=>$game,
    'folder'=>$folder,
    'id'=>$id
  );
}

function a2s_players($ip, $port, $timeout=2){
  $cacheKey='a2s_players_'.$ip.'_'.$port;
  $c=_cache_get($cacheKey, 10);
  if($c!==null) return $c;

  $challengeReq="\xFF\xFF\xFF\xFFU\xFF\xFF\xFF\xFF";
  $data=_a2s_query($ip,$port,$challengeReq,$timeout);
  if(!$data || strlen($data)<6){ _cache_set($cacheKey, array()); return array(); }
  if(ord($data[0])!==0x41){ _cache_set($cacheKey, array()); return array(); }
  $challenge=substr($data,1,4);

  $req="\xFF\xFF\xFF\xFFU".$challenge;
  $data=_a2s_query($ip,$port,$req,$timeout);
  if(!$data || strlen($data)<2){ _cache_set($cacheKey, array()); return array(); }
  if(ord($data[0])!==0x44){ _cache_set($cacheKey, array()); return array(); }

  $o=1;
  $count=ord($data[$o]);
  $o++;
  $out=array();
  for($i=0;$i<$count && $o<strlen($data);$i++){
    $index=ord($data[$o]);
    $o++;
    $name=_a2s_read_cstring($data,$o);
    if($o+4>strlen($data)) break;
    $score=unpack('l', substr($data,$o,4))[1];
    $o+=4;
    if($o+4>strlen($data)) break;
    $duration=unpack('f', substr($data,$o,4))[1];
    $o+=4;
    $out[]=array('name'=>$name,'score'=>$score,'time'=>$duration);
  }

  _cache_set($cacheKey, $out);
  return $out;
}
