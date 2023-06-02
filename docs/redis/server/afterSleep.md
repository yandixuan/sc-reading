# afterSleep

```c
void afterSleep(struct aeEventLoop *eventLoop) {
    UNUSED(eventLoop);
    /********************* WARNING ********************
     * Do NOT add anything above moduleAcquireGIL !!! *
     ***************************** ********************/
    if (!ProcessingEventsWhileBlocked) {
        /* Acquire the modules GIL so that their threads won't touch anything. */
        if (moduleCount()) {
            mstime_t latency;
            latencyStartMonitor(latency);

            moduleAcquireGIL();
            moduleFireServerEvent(REDISMODULE_EVENT_EVENTLOOP,
                                  REDISMODULE_SUBEVENT_EVENTLOOP_AFTER_SLEEP,
                                  NULL);
            latencyEndMonitor(latency);
            latencyAddSampleIfNeeded("module-acquire-GIL",latency);
        }
    }

    /* Update the time cache. */
    updateCachedTime(1);

    /* Update command time snapshot in case it'll be required without a command
     * e.g. somehow used by module timers. Don't update it while yielding to a
     * blocked command, call() will handle that and restore the original time. */
    if (!ProcessingEventsWhileBlocked) {
        server.cmd_time_snapshot = server.mstime;
    }
}
```
