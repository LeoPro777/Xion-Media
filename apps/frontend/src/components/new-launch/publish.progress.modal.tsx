'use client';

import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChannelProgressItem,
  usePublishProgressStore,
} from '@gitroom/frontend/components/new-launch/publish.progress.store';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { AddEditModal } from '@gitroom/frontend/components/new-launch/add.edit.modal';
import { ExistingDataContextProvider } from '@gitroom/frontend/components/launches/helpers/use.existing.data';
import { useShallow } from 'zustand/react/shallow';
import clsx from 'clsx';
import { fromUtc, newDayjs } from '@gitroom/frontend/components/layout/set.timezone';

export const parseErrorMessage = (raw: string | undefined): string => {
  if (!raw) return 'Error desconocido al procesar la publicación';

  if (
    raw.includes('unaudited_client_can_only_post_to_private_accounts') ||
    raw.includes('App not approved for public posting')
  ) {
    return 'TikTok (Modo pruebas): Requiere cuenta privada y privacidad "Solo yo" (SELF_ONLY), o método UPLOAD (Bandeja de entrada).';
  }
  if (
    raw.includes('Please re-authenticate') ||
    raw.includes('Error validating access token') ||
    raw.includes('Unauthorized') ||
    raw.includes('code: 32') ||
    raw.includes('refresh-token')
  ) {
    return 'La sesión con la red social ha expirado o fue rechazada. Por favor reconecta el canal.';
  }
  if (raw.includes('credits depleted') || raw.includes('credits-depleted')) {
    return 'X (Twitter): Tu cuenta de desarrollador no tiene créditos para subir multimedia (fotos/videos). El nivel gratuito de X solo permite tuits de texto plano; para multimedia requiere créditos o plan Basic en developer.x.com.';
  }
  if (raw.includes('Callback URL not approved')) {
    return 'La URL de redirección no está aprobada en la configuración de la app de la plataforma.';
  }
  if (raw.includes('Rate limit') || raw.includes('uploadLimitExceeded')) {
    return 'Se ha alcanzado el límite diario o cuota de subida para esta red social.';
  }
  if (raw.includes('Could not determine the video size') || raw.includes('Blocked IP')) {
    return 'No se pudo leer el archivo multimedia local para la transmisión.';
  }

  // Try extracting inner JSON message if present
  try {
    const parsed = JSON.parse(raw);
    if (parsed.message) return parsed.message;
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.cause?.failure?.message) return parsed.cause.failure.message;
  } catch (e) {
    // not raw json
  }

  const clean = raw.split('\n')[0].replace(/\{.*"message":"([^"]+)".*\}/, '$1');
  return clean.length > 180 ? clean.slice(0, 180) + '...' : clean;
};

export const PublishProgressModal: FC = () => {
  const fetch = useFetch();
  const modals = useModals();

  const {
    isOpen,
    isMinimized,
    group,
    title,
    contentSnippet,
    thumbnail,
    mediaType,
    channels,
    minimize,
    restore,
    close,
    updateChannel,
  } = usePublishProgressStore(
    useShallow((state) => ({
      isOpen: state.isOpen,
      isMinimized: state.isMinimized,
      group: state.group,
      title: state.title,
      contentSnippet: state.contentSnippet,
      thumbnail: state.thumbnail,
      mediaType: state.mediaType,
      channels: state.channels,
      minimize: state.minimize,
      restore: state.restore,
      close: state.close,
      updateChannel: state.updateChannel,
    }))
  );

  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  // Poll status from backend
  useEffect(() => {
    if (!isOpen || (!group && !channelsRef.current.some((c) => c.postId))) return;

    let isMounted = true;
    let pollCount = 0;

    const checkStatus = async () => {
      pollCount++;
      const currentList = channelsRef.current;
      const allFinished =
        currentList.length > 0 &&
        currentList.every(
          (c) => c.status === 'completed' || c.status === 'error'
        );
      if (allFinished) return;

      try {
        let allPosts: any[] = [];

        // 1. Fetch by group if available
        if (group) {
          const res = await fetch(`/posts/group/${group}`).catch(() => null);
          if (res && res.ok) {
            const data = await res.json().catch(() => null);
            if (data) {
              allPosts = [
                ...(data.posts || []),
                ...((data.siblings || []).flatMap((s: any) => s.posts || [])),
              ];
            }
          }
        }

        // 2. Fetch individually by postId if needed
        for (const ch of currentList) {
          if (ch.postId && !allPosts.some((p) => p.id === ch.postId)) {
            const singleRes = await fetch(`/posts/${ch.postId}`).catch(() => null);
            if (singleRes && singleRes.ok) {
              const singleData = await singleRes.json().catch(() => null);
              if (singleData?.posts) {
                allPosts.push(...singleData.posts);
              }
            }
          }
        }

        if (!isMounted) return;

        // 3. Match posts to channels
        currentList.forEach((matchedChannel) => {
          if (
            matchedChannel.status === 'completed' ||
            matchedChannel.status === 'error'
          ) {
            return;
          }

          const post = allPosts.find(
            (p) =>
              (matchedChannel.postId && p.id === matchedChannel.postId) ||
              p.integrationId === matchedChannel.id ||
              p.integration?.id === matchedChannel.id
          );

          if (post) {
            if (post.state === 'PUBLISHED') {
              updateChannel(matchedChannel.id, {
                status: 'completed',
                progress: 100,
                postId: post.id,
                releaseURL: post.releaseURL || '',
                statusMessage: matchedChannel.isDraft
                  ? 'Guardado Borrador'
                  : 'Publicado',
              });
            } else if (post.state === 'ERROR') {
              updateChannel(matchedChannel.id, {
                status: 'error',
                progress: 100,
                postId: post.id,
                statusMessage: 'Error de subida',
                error: parseErrorMessage(post.error),
              });
            } else if (post.state === 'DRAFT') {
              updateChannel(matchedChannel.id, {
                status: 'completed',
                progress: 100,
                postId: post.id,
                statusMessage: 'Guardado como borrador',
              });
            } else if (post.state === 'QUEUE') {
              const dynamicMessages = [
                'Transmitiendo medios a la API...',
                'Subiendo fragmentos multimedia...',
                'Procesando en la red social...',
                'Validando publicación...',
              ];
              const step = pollCount % dynamicMessages.length;
              const nextProgress = Math.min(88, matchedChannel.progress + 8);
              updateChannel(matchedChannel.id, {
                status: 'uploading',
                progress: Math.max(25, nextProgress),
                statusMessage: dynamicMessages[step],
              });
            }
          } else {
            // Smooth progress while post is registering in Temporal
            const nextProgress = Math.min(75, matchedChannel.progress + 6);
            updateChannel(matchedChannel.id, {
              status: 'uploading',
              progress: Math.max(20, nextProgress),
              statusMessage: 'Conectando con la red social...',
            });
          }
        });
      } catch (err) {
        // network polling silent catch
      }
    };

    const initialTimer = setTimeout(checkStatus, 350);
    const interval = setInterval(checkStatus, 1500);

    return () => {
      isMounted = false;
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [isOpen, group, fetch, updateChannel]);

  // Global calculations
  const totalCount = channels.length || 1;
  const completedCount = channels.filter((c) => c.status === 'completed').length;
  const errorCount = channels.filter((c) => c.status === 'error').length;
  const totalProgressSum = channels.reduce((acc, c) => acc + c.progress, 0);
  const avgProgress = Math.round(totalProgressSum / totalCount);
  const isFinished = channels.length > 0 && channels.every((c) => c.status === 'completed' || c.status === 'error');

  // Handle individual re-try / adjustment for a specific channel
  const handleAdjustAndRetry = useCallback(
    async (channel: ChannelProgressItem) => {
      minimize(); // minimize progress modal while adjusting
      try {
        let data: any = null;
        if (channel.postId) {
          const postRes = await fetch(`/posts/${channel.postId}`);
          if (postRes.ok) data = await postRes.json();
        }
        if (!data && group) {
          const res = await fetch(`/posts/group/${group}`);
          if (res.ok) data = await res.json();
        }
        if (!data) return;

        modals.openModal({
          id: 'add-edit-modal',
          closeOnClickOutside: false,
          removeLayout: true,
          closeOnEscape: false,
          withCloseButton: false,
          askClose: true,
          fullScreen: true,
          classNames: {
            modal: 'w-[100%] max-w-[1400px] text-textColor',
          },
          children: (
            <ExistingDataContextProvider value={data}>
              <AddEditModal
                date={newDayjs()}
                focusedChannel={channel.id}
                integrations={[
                  {
                    id: channel.id,
                    name: channel.name,
                    picture: channel.avatarPicture || '',
                    identifier: channel.platformKey,
                    providerIdentifier: channel.platformKey,
                  } as any,
                ]}
                allIntegrations={[
                  {
                    id: channel.id,
                    name: channel.name,
                    picture: channel.avatarPicture || '',
                    identifier: channel.platformKey,
                    providerIdentifier: channel.platformKey,
                  } as any,
                ]}
                reopenModal={() => {
                  restore();
                }}
                mutate={() => {
                  restore();
                  updateChannel(channel.id, {
                    status: 'uploading',
                    progress: 20,
                    statusMessage: 'Reintentando subida...',
                    error: undefined,
                  });
                }}
              />
            </ExistingDataContextProvider>
          ),
        });
      } catch (e) {
        restore();
      }
    },
    [group, fetch, modals, minimize, restore, updateChannel]
  );

  if (!isOpen) return null;

  // Floating Minimized Widget
  if (isMinimized) {
    return (
      <div
        onClick={restore}
        className="fixed bottom-5 right-5 z-50 bg-[#16161d] border border-purple-500/40 hover:border-purple-500 text-white rounded-2xl p-3 shadow-2xl shadow-purple-950/40 cursor-pointer flex items-center gap-3.5 transition-all transform hover:-translate-y-1 group select-none"
      >
        <div className="relative w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center text-purple-400 border border-purple-500/30">
          <svg className="w-5 h-5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-purple-500 rounded-full border-2 border-[#16161d]"></span>
        </div>

        <div className="pr-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-100">
              {isFinished ? 'Subida finalizada' : 'Subiendo publicaciones...'}
            </span>
            <span className="text-xs font-mono font-semibold text-purple-400">
              {avgProgress}%
            </span>
          </div>
          <div className="w-36 h-1.5 bg-zinc-800 rounded-full mt-1.5 overflow-hidden">
            <div
              className={clsx(
                'h-full transition-all duration-300',
                errorCount > 0 ? 'bg-amber-500' : 'bg-purple-500'
              )}
              style={{ width: `${avgProgress}%` }}
            ></div>
          </div>
          <span className="text-[10px] text-zinc-400 mt-1 block">Toca para abrir detalles</span>
        </div>

        <div className="p-1.5 rounded-lg text-zinc-400 group-hover:text-white group-hover:bg-zinc-800 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </div>
      </div>
    );
  }

  // Full Modal
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md transition-all duration-300 select-none">
      <div className="w-full max-w-2xl bg-[#141418] border border-[#272731] rounded-2xl shadow-2xl shadow-black/80 flex flex-col overflow-hidden transition-all duration-300">

        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#22222b] bg-gradient-to-r from-[#17171d] via-[#141418] to-[#17171d] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <svg className="w-4 h-4 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100 tracking-tight flex items-center gap-2">
                Publicando contenido
                <span
                  className={clsx(
                    'text-[11px] font-medium px-2 py-0.5 rounded-md border',
                    isFinished
                      ? errorCount > 0
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                  )}
                >
                  {isFinished ? (errorCount > 0 ? 'Con observaciones' : 'Finalizado') : 'Lote Activo'}
                </span>
              </h2>
              <p className="text-xs text-zinc-400">Distribuyendo medios según las especificaciones de cada red</p>
            </div>
          </div>

          {/* Minimize & Close */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={minimize}
              title="Minimizar a segundo plano"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-[#23232c] transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <button
              onClick={close}
              title="Cerrar modal"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto max-h-[75vh] space-y-6">

          {/* 1. Tarjeta resumen del Video / Contenido */}
          <div className="bg-[#191920] border border-[#272733] rounded-xl p-3.5 flex items-center gap-4 group hover:border-[#383848] transition">
            <div className="relative w-24 h-16 sm:w-28 sm:h-18 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-900 border border-zinc-700/40 flex items-center justify-center">
              {thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbnail} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="text-xl text-purple-400 font-bold">🎬</div>
              )}
              {mediaType === 'video' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition">
                  <div className="w-6 h-6 rounded-full bg-purple-600/90 text-white flex items-center justify-center shadow">
                    <svg className="w-3 h-3 fill-current ml-0.5" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400 bg-purple-950/50 border border-purple-800/40 px-1.5 py-0.5 rounded">
                  {mediaType === 'video' ? 'Reel / Short / Clip' : 'Post / Imagen'}
                </span>
                <span className="text-[11px] text-zinc-400">{channels.length} canales seleccionados</span>
              </div>
              <h3 className="text-sm font-semibold text-zinc-100 truncate" title={title}>
                {title}
              </h3>
              <p className="text-xs text-zinc-400 truncate mt-0.5">
                {contentSnippet || 'Publicación programada y optimizada para redes sociales.'}
              </p>
            </div>
          </div>

          {/* 2. Sección de Progreso Global */}
          <div className="space-y-2.5 bg-[#17171e]/80 border border-[#262632] rounded-xl p-4">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-zinc-200">Progreso Total</span>
                <span className="text-zinc-500">•</span>
                <span className="text-zinc-400 font-medium">
                  {completedCount} de {totalCount} completados
                  {errorCount > 0 && ` (${errorCount} con error)`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold font-mono text-purple-400">{avgProgress}%</span>
              </div>
            </div>

            <div className="relative w-full h-3 bg-[#23232c] rounded-full overflow-hidden border border-[#2b2b38]">
              <div
                className="h-full bg-gradient-to-r from-purple-600 via-indigo-500 to-violet-400 transition-all duration-300 ease-out rounded-full relative"
                style={{ width: `${avgProgress}%` }}
              >
                <div
                  className="absolute inset-0 bg-white/20 w-full animate-pulse"
                  style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)' }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-0.5">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping"></span>
                Velocidad estimada: <strong className="text-zinc-300">3.8 MB/s</strong>
              </span>
              <span>
                {isFinished ? (
                  errorCount > 0 ? (
                    <span className="text-amber-400 font-medium">Lote terminado con errores</span>
                  ) : (
                    <span className="text-emerald-400 font-medium">✓ Todas las publicaciones listas</span>
                  )
                ) : (
                  `Aprox. ${Math.max(2, Math.round((100 - avgProgress) * 0.2))}s restantes`
                )}
              </span>
            </div>
          </div>

          {/* 3. Lista Desglosada por Canal / Plataforma */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Desglose por plataforma</span>
              <span className="text-xs text-zinc-500">{channels.length} destinos vinculados</span>
            </div>

            <div className="space-y-2">
              {channels.map((ch) => (
                <div
                  key={ch.id}
                  className={clsx(
                    'p-3 sm:p-3.5 rounded-xl border transition-all duration-300 flex flex-col gap-2.5',
                    ch.status === 'uploading' && 'bg-[#181822] border-purple-500/40 shadow-sm shadow-purple-950/20',
                    ch.status === 'completed' && 'bg-[#15151b] border-emerald-500/30',
                    ch.status === 'error' && 'bg-[#1b1517] border-rose-500/50',
                    ch.status === 'pending' && 'bg-[#15151b] border-[#252530] opacity-80'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    {/* Avatar y Datos del Canal */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative flex-shrink-0">
                        {ch.avatarPicture ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={ch.avatarPicture}
                            alt={ch.name}
                            className="w-9 h-9 rounded-full object-cover ring-2 ring-zinc-800"
                          />
                        ) : (
                          <div className={clsx('w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ring-2 ring-zinc-800', ch.avatarBg)}>
                            {ch.badgeLetter}
                          </div>
                        )}
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#181820] border border-zinc-700 flex items-center justify-center overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/icons/platforms/${ch.platformKey}.png`}
                            alt={ch.network}
                            className="w-3.5 h-3.5 object-contain"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-zinc-100 truncate">{ch.name}</span>
                          {ch.isDraft && (
                            <span className="text-[9px] uppercase tracking-wider font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded">
                              Borrador
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                          <span className="font-medium text-zinc-300">{ch.network}</span>
                          <span>•</span>
                          <span>{ch.targetType}</span>
                        </div>
                      </div>
                    </div>

                    {/* Estado e Indicador de Progreso */}
                    <div className="flex items-center gap-3 text-right flex-shrink-0">
                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1.5 text-xs font-medium">
                          {ch.status === 'completed' && (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              {ch.isDraft ? 'Guardado Borrador' : 'Publicado'}
                            </span>
                          )}
                          {ch.status === 'uploading' && (
                            <span className="inline-flex items-center gap-1.5 text-purple-400 font-medium">
                              <svg className="animate-spin h-3 w-3 text-purple-400" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              {ch.statusMessage || 'Subiendo...'}
                            </span>
                          )}
                          {ch.status === 'error' && (
                            <span className="inline-flex items-center gap-1 text-rose-400 font-semibold">
                              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              Error de subida
                            </span>
                          )}
                          {ch.status === 'pending' && (
                            <span className="inline-flex items-center gap-1 text-zinc-400">
                              <svg className="w-3 h-3 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                              </svg>
                              En espera
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono mt-0.5">{ch.progress}%</div>
                      </div>
                    </div>
                  </div>

                  {/* Barra de progreso individual */}
                  <div className="w-full bg-[#24242e] h-1.5 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        'h-full rounded-full transition-all duration-300 ease-out',
                        ch.status === 'completed' && 'bg-emerald-500',
                        ch.status === 'uploading' && 'bg-gradient-to-r from-purple-500 to-indigo-400',
                        ch.status === 'error' && 'bg-rose-500',
                        ch.status === 'pending' && 'bg-zinc-600'
                      )}
                      style={{ width: `${ch.progress}%` }}
                    />
                  </div>

                  {/* Detalle de Error y Botón de Ajustar / Reintentar */}
                  {ch.status === 'error' && (
                    <div className="mt-1 p-2.5 rounded-lg bg-rose-950/30 border border-rose-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex items-start gap-2 text-xs text-rose-300">
                        <svg className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="leading-relaxed">{ch.error || 'Ocurrió un error al procesar la publicación.'}</span>
                      </div>
                      <button
                        onClick={() => handleAdjustAndRetry(ch)}
                        className="self-end sm:self-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow transition flex items-center gap-1.5 flex-shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span>Ajustar y reintentar</span>
                      </button>
                    </div>
                  )}

                  {/* Enlace a la publicación exitosa */}
                  {ch.status === 'completed' && ch.releaseURL && (
                    <div className="mt-0.5 flex justify-end">
                      <a
                        href={ch.releaseURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 font-medium transition"
                      >
                        <span>Ver publicación en {ch.network}</span>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-[#15151b] border-t border-[#23232e] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-zinc-400 flex items-center gap-1.5 order-2 sm:order-1">
            <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z" clipRule="evenodd" />
            </svg>
            <span>Autenticado vía OAuth 2.0 y servidor MCP</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end order-1 sm:order-2">
            <button
              onClick={close}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-700/60 transition"
            >
              Cerrar
            </button>
            <button
              onClick={minimize}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 shadow-md shadow-purple-900/40 flex items-center justify-center gap-2 transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              <span>Minimizar en segundo plano</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

