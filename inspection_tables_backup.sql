CREATE TABLE public.inspection_templates_backup (
    CONSTRAINT inspection_templates_type_check CHECK ((type = ANY (ARRAY['horse'::text, 'combo'::text, 'trailer'::text])))
ALTER TABLE public.inspection_templates_backup OWNER TO postgres;
CREATE TABLE public.inspections_backup (
    CONSTRAINT inspections_category_check CHECK ((category = ANY (ARRAY['A'::text, 'B'::text]))),
    CONSTRAINT inspections_overall_status_check CHECK ((overall_status = ANY (ARRAY['OK'::text, 'Faulty'::text])))
ALTER TABLE public.inspections_backup OWNER TO postgres;
-- Name: inspections_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
ALTER TABLE public.inspections_backup ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.inspections_id_seq
-- Name: load_inspections; Type: TABLE; Schema: public; Owner: postgres
CREATE TABLE public.load_inspections_backup (
ALTER TABLE public.load_inspections_backup OWNER TO postgres;
-- Name: load_inspections_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
ALTER TABLE public.load_inspections_backup ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.load_inspections_id_seq
CREATE TABLE public.trailer_inspection_backup (
ALTER TABLE public.trailer_inspection_backup OWNER TO postgres;
-- Name: TABLE trailer_inspection_backup; Type: COMMENT; Schema: public; Owner: postgres
COMMENT ON TABLE public.trailer_inspection_backup IS 'Trailer Inspection of vehicle_inspections';
-- Name: trailer_inspection_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
ALTER TABLE public.trailer_inspection_backup ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.trailer_inspection_id_seq
-- Name: vehicle_inspections; Type: TABLE; Schema: public; Owner: postgres
CREATE TABLE public.vehicle_inspections_backup (
ALTER TABLE public.vehicle_inspections_backup OWNER TO postgres;
-- Name: vehicle_inspections_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
ALTER TABLE public.vehicle_inspections_backup ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.vehicle_inspections_id_seq
-- Data for Name: inspection_templates_backup; Type: TABLE DATA; Schema: public; Owner: postgres
COPY public.inspection_templates_backup (id, type, structure, created_at, updated_at, inspection) FROM stdin;
-- Data for Name: inspections_backup; Type: TABLE DATA; Schema: public; Owner: postgres
COPY public.inspections_backup (id, vehicle_id, driver_id, odo_reading, inspection_date, checklist, overall_status, category, remarks, created_at, trip_id) FROM stdin;
-- Data for Name: load_inspections_backup; Type: TABLE DATA; Schema: public; Owner: postgres
COPY public.load_inspections_backup (id, driver_id, trip_id, images, inspection_date, status, created_at, updated_at) FROM stdin;
-- Data for Name: trailer_inspection_backup; Type: TABLE DATA; Schema: public; Owner: postgres
COPY public.trailer_inspection_backup (driver_id, vehicle_id, inspected, inspection_date, created_at, updated_at, user_id, id, type, trailer) FROM stdin;
dd7068fb-0cd4-4bff-952d-a091aab31a3d	nicoleen.adminmanager@epscourier.co.za	admin	2025-10-14 11:37:49.022471+00	f	t	[{"page": "dashboard", "actions": ["view", "create", "edit", "delete"]}, {"page": "fleetJobs", "actions": ["view", "create", "edit", "delete"]}, {"page": "loadPlan", "actions": ["view", "create", "edit", "delete"]}, {"page": "fuel", "actions": ["view", "create", "edit", "delete"]}, {"page": "drivers", "actions": ["view", "create", "edit", "delete"]}, {"page": "vehicles", "actions": ["view", "create", "edit", "delete"]}, {"page": "costCenters", "actions": ["view", "create", "edit", "delete"]}, {"page": "financials", "actions": ["view", "create", "edit", "delete"]}, {"page": "inspections_backup", "actions": ["view", "create", "edit", "delete"]}, {"page": "userManagement", "actions": ["view", "create", "edit", "delete"]}, {"page": "systemSettings", "actions": ["view", "create", "edit", "delete"]}]	\N	\N	\N	\N	t
77a1933f-605f-4dd3-b888-1e03d2fd861a	evert@epscourier.co.za	admin	2025-10-14 11:37:49.022471+00	f	t	[{"page": "dashboard", "actions": ["view", "create", "edit", "delete"]}, {"page": "fleetJobs", "actions": ["view", "create", "edit", "delete"]}, {"page": "loadPlan", "actions": ["view", "create", "edit", "delete"]}, {"page": "fuel", "actions": ["view", "create", "edit", "delete"]}, {"page": "drivers", "actions": ["view", "create", "edit", "delete"]}, {"page": "vehicles", "actions": ["view", "create", "edit", "delete"]}, {"page": "costCenters", "actions": ["view", "create", "edit", "delete"]}, {"page": "financials", "actions": ["view", "create", "edit", "delete"]}, {"page": "inspections_backup", "actions": ["view", "create", "edit", "delete"]}, {"page": "userManagement", "actions": ["view", "create", "edit", "delete"]}, {"page": "systemSettings", "actions": ["view", "create", "edit", "delete"]}]	\N	\N	\N	\N	t
82286064-f353-4064-926a-afbcc79ed1af	kenny@eps.couriers.co.za	fleet manager	2025-10-14 11:37:49.022471+00	f	t	[{"page": "dashboard", "actions": ["view", "create", "edit"]}, {"page": "fleetJobs", "actions": ["view", "create", "edit"]}, {"page": "drivers", "actions": ["view", "create", "edit"]}, {"page": "vehicles", "actions": ["view", "create", "edit"]}, {"page": "inspections_backup", "actions": ["view", "create", "edit"]}, {"page": "fuel", "actions": ["view", "create", "edit"]}, {"page": "financials", "actions": ["view"]}, {"page": "systemSettings", "actions": ["view"]}]	\N	\N	\N	\N	t
d0ab1253-2f1f-4355-8d12-5467ed39aaed	justin.workshoprepairs@epscourier.co.za	admin	2025-10-23 18:49:17.195659+00	t	t	[{"page": "dashboard", "actions": ["view", "create", "edit", "delete"]}, {"page": "fleetJobs", "actions": ["view", "create", "edit", "delete"]}, {"page": "loadPlan", "actions": ["view", "create", "edit", "delete"]}, {"page": "fuel", "actions": ["view", "create", "edit", "delete"]}, {"page": "drivers", "actions": ["view", "create", "edit", "delete"]}, {"page": "vehicles", "actions": ["view", "create", "edit", "delete"]}, {"page": "costCenters", "actions": ["view", "create", "edit", "delete"]}, {"page": "financials", "actions": ["view", "create", "edit", "delete"]}, {"page": "inspections_backup", "actions": ["view", "create", "edit", "delete"]}, {"page": "userManagement", "actions": ["view", "create", "edit", "delete"]}, {"page": "systemSettings", "actions": ["view", "create", "edit", "delete"]}]	\N	\N	EPS Courier	\N	t
f8dcfad4-a763-418e-b6e2-c49c6e7cf615	deon.workshopmanager@epscourier.co.za	admin	2025-10-23 18:49:02.151179+00	t	t	[{"page": "dashboard", "actions": ["view", "create", "edit", "delete"]}, {"page": "fleetJobs", "actions": ["view", "create", "edit", "delete"]}, {"page": "loadPlan", "actions": ["view", "create", "edit", "delete"]}, {"page": "fuel", "actions": ["view", "create", "edit", "delete"]}, {"page": "drivers", "actions": ["view", "create", "edit", "delete"]}, {"page": "vehicles", "actions": ["view", "create", "edit", "delete"]}, {"page": "costCenters", "actions": ["view", "create", "edit", "delete"]}, {"page": "financials", "actions": ["view", "create", "edit", "delete"]}, {"page": "inspections_backup", "actions": ["view", "create", "edit", "delete"]}, {"page": "userManagement", "actions": ["view", "create", "edit", "delete"]}, {"page": "systemSettings", "actions": ["view", "create", "edit", "delete"]}]	\N	\N	EPS Courier	\N	t
2d29fcb7-e493-45a7-b641-f1eb3d474004	thomas@epscourier.co.za	admin	2025-10-23 18:49:27.582104+00	t	t	[{"page": "dashboard", "actions": ["view", "create", "edit", "delete"]}, {"page": "fleetJobs", "actions": ["view", "create", "edit", "delete"]}, {"page": "loadPlan", "actions": ["view", "create", "edit", "delete"]}, {"page": "fuel", "actions": ["view", "create", "edit", "delete"]}, {"page": "drivers", "actions": ["view", "create", "edit", "delete"]}, {"page": "vehicles", "actions": ["view", "create", "edit", "delete"]}, {"page": "costCenters", "actions": ["view", "create", "edit", "delete"]}, {"page": "financials", "actions": ["view", "create", "edit", "delete"]}, {"page": "inspections_backup", "actions": ["view", "create", "edit", "delete"]}, {"page": "userManagement", "actions": ["view", "create", "edit", "delete"]}, {"page": "systemSettings", "actions": ["view", "create", "edit", "delete"]}]	\N	\N	EPS Courier	\N	t
c9d1bb07-f561-4258-96e4-af16b8efed5e	lotie.traileryardsup@epscourier.co.za	admin	2025-10-23 18:51:58.249271+00	t	t	[{"page": "dashboard", "actions": ["view", "create", "edit", "delete"]}, {"page": "fleetJobs", "actions": ["view", "create", "edit", "delete"]}, {"page": "loadPlan", "actions": ["view", "create", "edit", "delete"]}, {"page": "fuel", "actions": ["view", "create", "edit", "delete"]}, {"page": "drivers", "actions": ["view", "create", "edit", "delete"]}, {"page": "vehicles", "actions": ["view", "create", "edit", "delete"]}, {"page": "costCenters", "actions": ["view", "create", "edit", "delete"]}, {"page": "financials", "actions": ["view", "create", "edit", "delete"]}, {"page": "inspections_backup", "actions": ["view", "create", "edit", "delete"]}, {"page": "userManagement", "actions": ["view", "create", "edit", "delete"]}, {"page": "systemSettings", "actions": ["view", "create", "edit", "delete"]}]	\N	\N	EPS Courier	\N	t
feec14cf-47ca-4259-a1b8-0ae59d85c4f6	workshop@eps.couriers	customer	2025-10-14 11:37:49.022471+00	f	t	[{"page": "drivers", "actions": ["view"]}, {"page": "vehicles", "actions": ["view"]}, {"page": "inspections_backup", "actions": ["view"]}, {"page": "fuel", "actions": ["view"]}, {"page": "financials", "actions": ["view"]}]	\N	\N	\N	\N	t
d403ec3c-3626-4ee4-8ba1-ff72cc34ee79	admin@eps.com	admin	2025-10-14 11:37:49.022471+00	f	t	[{"page": "dashboard", "actions": ["view", "create", "edit", "delete"]}, {"page": "fleetJobs", "actions": ["view", "create", "edit", "delete"]}, {"page": "loadPlan", "actions": ["view", "create", "edit", "delete"]}, {"page": "fuel", "actions": ["view", "create", "edit", "delete"]}, {"page": "drivers", "actions": ["view", "create", "edit", "delete"]}, {"page": "vehicles", "actions": ["view", "create", "edit", "delete"]}, {"page": "costCenters", "actions": ["view", "create", "edit", "delete"]}, {"page": "financials", "actions": ["view", "create", "edit", "delete"]}, {"page": "inspections_backup", "actions": ["view", "create", "edit", "delete"]}, {"page": "userManagement", "actions": ["view", "create", "edit", "delete"]}, {"page": "systemSettings", "actions": ["view", "create", "edit", "delete"]}]	\N	\N	\N	\N	t
3677d3c9-9b0f-4d04-972c-d89b3376056a	theuns@epscourier.com	admin	2025-10-23 18:00:40.623123+00	\N	\N	[{"page": "dashboard", "actions": ["view", "create", "edit", "delete"]}, {"page": "fleetJobs", "actions": ["view", "create", "edit", "delete"]}, {"page": "loadPlan", "actions": ["view", "create", "edit", "delete"]}, {"page": "fuel", "actions": ["view", "create", "edit", "delete"]}, {"page": "drivers", "actions": ["view", "create", "edit", "delete"]}, {"page": "vehicles", "actions": ["view", "create", "edit", "delete"]}, {"page": "costCenters", "actions": ["view", "create", "edit", "delete"]}, {"page": "financials", "actions": ["view", "create", "edit", "delete"]}, {"page": "inspections_backup", "actions": ["view", "create", "edit", "delete"]}, {"page": "userManagement", "actions": ["view", "create", "edit", "delete"]}, {"page": "systemSettings", "actions": ["view", "create", "edit", "delete"]}]	\N	\N	EPS Courier	\N	t
6d7cb0cf-488a-4009-9005-4eebb057fa34	thabiso.fleetcontroller@epscourier.co.za	fleet manager	2025-10-23 18:53:05.356022+00	f	t	[{"page": "dashboard", "actions": ["view", "create", "edit"]}, {"page": "fleetJobs", "actions": ["view", "create", "edit"]}, {"page": "drivers", "actions": ["view", "create", "edit"]}, {"page": "vehicles", "actions": ["view", "create", "edit"]}, {"page": "inspections_backup", "actions": ["view", "create", "edit"]}, {"page": "fuel", "actions": ["view", "create", "edit"]}, {"page": "financials", "actions": ["view"]}, {"page": "systemSettings", "actions": ["view"]}]	\N	\N	EPS Courier	\N	t
0eb377af-9622-4929-9624-14960f0fdd2e	percy@eps.couriers.co.za	admin	2025-10-14 11:37:49.022471+00	f	t	[{"page": "dashboard", "actions": ["view", "create", "edit", "delete"]}, {"page": "fleetJobs", "actions": ["view", "create", "edit", "delete"]}, {"page": "loadPlan", "actions": ["view", "create", "edit", "delete"]}, {"page": "fuel", "actions": ["view", "create", "edit", "delete"]}, {"page": "drivers", "actions": ["view", "create", "edit", "delete"]}, {"page": "vehicles", "actions": ["view", "create", "edit", "delete"]}, {"page": "costCenters", "actions": ["view", "create", "edit", "delete"]}, {"page": "financials", "actions": ["view", "create", "edit", "delete"]}, {"page": "inspections_backup", "actions": ["view", "create", "edit", "delete"]}, {"page": "userManagement", "actions": ["view", "create", "edit", "delete"]}, {"page": "systemSettings", "actions": ["view", "create", "edit", "delete"]}]	\N	\N	\N	\N	t
f5757c3e-93ad-4c52-a5a6-f3f76abc73b4	malibongwe.snrfleetcontroller@epscourier.co.za	admin	2025-10-14 11:37:49.022471+00	f	t	[{"page": "dashboard", "actions": ["view", "create", "edit", "delete"]}, {"page": "fleetJobs", "actions": ["view", "create", "edit", "delete"]}, {"page": "loadPlan", "actions": ["view", "create", "edit", "delete"]}, {"page": "fuel", "actions": ["view", "create", "edit", "delete"]}, {"page": "drivers", "actions": ["view", "create", "edit", "delete"]}, {"page": "vehicles", "actions": ["view", "create", "edit", "delete"]}, {"page": "costCenters", "actions": ["view", "create", "edit", "delete"]}, {"page": "financials", "actions": ["view", "create", "edit", "delete"]}, {"page": "inspections_backup", "actions": ["view", "create", "edit", "delete"]}, {"page": "userManagement", "actions": ["view", "create", "edit", "delete"]}, {"page": "systemSettings", "actions": ["view", "create", "edit", "delete"]}]	\N	\N	\N	\N	t
34930c66-263d-42c3-9ce0-244b4911d288	tester@gmail.com	driver	2025-11-07 22:41:00+00	f	f	[{"page": "dashboard", "actions": ["view", "create", "edit", "delete"]}, {"page": "fleetJobs", "actions": ["view", "create", "edit", "delete"]}, {"page": "loadPlan", "actions": ["view", "create", "edit", "delete"]}, {"page": "fuel", "actions": ["view", "create", "edit", "delete"]}, {"page": "drivers", "actions": ["view", "create", "edit", "delete"]}, {"page": "vehicles", "actions": ["view", "create", "edit", "delete"]}, {"page": "costCenters", "actions": ["view", "create", "edit", "delete"]}, {"page": "financials", "actions": ["view", "create", "edit", "delete"]}, {"page": "inspections_backup", "actions": ["view", "create", "edit", "delete"]}, {"page": "userManagement", "actions": ["view", "create", "edit", "delete"]}, {"page": "systemSettings", "actions": ["view", "create", "edit", "delete"]}]	f	\N	eps	\N	t
a2640bf9-78f5-4808-ac41-e8605830f0b0	brianv@gmail.com	admin	2025-10-24 09:38:07.528639+00	t	t	[{"page": "dashboard", "actions": ["view", "create", "edit", "delete"]}, {"page": "fleetJobs", "actions": ["view", "create", "edit", "delete"]}, {"page": "loadPlan", "actions": ["view", "create", "edit", "delete"]}, {"page": "fuel", "actions": ["view", "create", "edit", "delete"]}, {"page": "drivers", "actions": ["view", "create", "edit", "delete"]}, {"page": "vehicles", "actions": ["view", "create", "edit", "delete"]}, {"page": "costCenters", "actions": ["view", "create", "edit", "delete"]}, {"page": "financials", "actions": ["view", "create", "edit", "delete"]}, {"page": "inspections_backup", "actions": ["view", "create", "edit", "delete"]}, {"page": "userManagement", "actions": ["view", "create", "edit", "delete"]}, {"page": "systemSettings", "actions": ["view", "create", "edit", "delete"]}]	\N	\N	EPS Courier	\N	t
bd504fc8-d572-4e43-b3d0-be74a1a7b209	mabukwatakunda@gmail.com	admin	2025-11-12 12:14:13.909+00	f	t	[{"page": "dashboard", "actions": ["view", "create", "edit", "delete"]}, {"page": "fleetJobs", "actions": ["view", "create", "edit", "delete"]}, {"page": "loadPlan", "actions": ["view", "create", "edit", "delete"]}, {"page": "fuel", "actions": ["view", "create", "edit", "delete"]}, {"page": "drivers", "actions": ["view", "create", "edit", "delete"]}, {"page": "vehicles", "actions": ["view", "create", "edit", "delete"]}, {"page": "costCenters", "actions": ["view", "create", "edit", "delete"]}, {"page": "financials", "actions": ["view", "create", "edit", "delete"]}, {"page": "inspections_backup", "actions": ["view", "create", "edit", "delete"]}, {"page": "userManagement", "actions": ["view", "create", "edit", "delete"]}, {"page": "systemSettings", "actions": ["view", "create", "edit", "delete"]}]	f		EPS Courier Services	+27623661042	t
87c2f381-6a13-420a-a568-434b0d046912	mabukwa25@gmail.com	admin	2025-11-12 13:41:56.568+00	f	t	[{"page": "dashboard", "actions": ["view", "create", "edit", "delete"]}, {"page": "fleetJobs", "actions": ["view", "create", "edit", "delete"]}, {"page": "loadPlan", "actions": ["view", "create", "edit", "delete"]}, {"page": "fuel", "actions": ["view", "create", "edit", "delete"]}, {"page": "drivers", "actions": ["view", "create", "edit", "delete"]}, {"page": "vehicles", "actions": ["view", "create", "edit", "delete"]}, {"page": "costCenters", "actions": ["view", "create", "edit", "delete"]}, {"page": "financials", "actions": ["view", "create", "edit", "delete"]}, {"page": "inspections_backup", "actions": ["view", "create", "edit", "delete"]}, {"page": "userManagement", "actions": ["view", "create", "edit", "delete"]}, {"page": "systemSettings", "actions": ["view", "create", "edit", "delete"]}]	f		EPS Courier Services	0623661042	f
-- Data for Name: vehicle_inspections_backup; Type: TABLE DATA; Schema: public; Owner: postgres
COPY public.vehicle_inspections_backup (driver_id, vehicle_id, inspected, inspection_date, created_at, updated_at, user_id, id, type, trailer, second_trailer) FROM stdin;
load-inspections_backup	load-inspections_backup	\N	2025-10-15 03:51:57.639854+00	2025-10-15 03:51:57.639854+00	t	f	\N	\N	\N	STANDARD
7a0d8e7a-0827-41cc-872c-f73812963e25	load-inspections_backup	40/1761538000949-s3bt2azgpun.jpeg	34930c66-263d-42c3-9ce0-244b4911d288	2025-10-27 04:06:42.881336+00	2025-10-27 04:06:42.881336+00	2025-10-27 04:06:42.881336+00	{"eTag": "\\"a1e9350540cc1ac042b24c46ac3a9e04\\"", "size": 40060, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2025-10-27T04:06:43.000Z", "contentLength": 40060, "httpStatusCode": 200}	d0573e7a-a5c6-4a4b-88b5-39e344f7a1cd	34930c66-263d-42c3-9ce0-244b4911d288	{}	2
77519677-e0c6-4432-927c-cf7d3aba6a3b	load-inspections_backup	.emptyFolderPlaceholder	\N	2025-10-25 18:19:41.679363+00	2025-10-25 18:19:41.679363+00	2025-10-25 18:19:41.679363+00	{"eTag": "\\"d41d8cd98f00b204e9800998ecf8427e\\"", "size": 0, "mimetype": "application/octet-stream", "cacheControl": "max-age=3600", "lastModified": "2025-10-25T18:19:41.678Z", "contentLength": 0, "httpStatusCode": 200}	719f5068-0383-4b7c-b67a-9730b32c5e25	\N	{}	1
load-inspections_backup	40	2025-10-27 04:06:42.881336+00	2025-10-27 04:06:42.881336+00
-- Name: inspections_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
SELECT pg_catalog.setval('public.inspections_id_seq', 49, true);
-- Name: load_inspections_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
SELECT pg_catalog.setval('public.load_inspections_id_seq', 10, true);
-- Name: trailer_inspection_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
SELECT pg_catalog.setval('public.trailer_inspection_id_seq', 1, false);
-- Name: vehicle_inspections_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
SELECT pg_catalog.setval('public.vehicle_inspections_id_seq', 111, true);
-- Name: inspection_templates_backup inspection_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
ALTER TABLE ONLY public.inspection_templates_backup
    ADD CONSTRAINT inspection_templates_pkey PRIMARY KEY (id);
-- Name: inspections_backup inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
ALTER TABLE ONLY public.inspections_backup
    ADD CONSTRAINT inspections_pkey PRIMARY KEY (id);
-- Name: load_inspections_backup load_inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
ALTER TABLE ONLY public.load_inspections_backup
    ADD CONSTRAINT load_inspections_pkey PRIMARY KEY (id);
-- Name: trailer_inspection_backup trailer_inspection_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
ALTER TABLE ONLY public.trailer_inspection_backup
    ADD CONSTRAINT trailer_inspection_pkey PRIMARY KEY (id);
-- Name: vehicle_inspections_backup vehicle_inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
ALTER TABLE ONLY public.vehicle_inspections_backup
    ADD CONSTRAINT vehicle_inspections_pkey PRIMARY KEY (id);
    ADD CONSTRAINT audit_load_inspection_id_fkey FOREIGN KEY (load_inspection_id) REFERENCES public.load_inspections_backup(id) ON DELETE SET NULL;
-- Name: inspections_backup inspections_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
ALTER TABLE ONLY public.inspections_backup
    ADD CONSTRAINT inspections_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);
-- Name: inspections_backup inspections_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
ALTER TABLE ONLY public.inspections_backup
    ADD CONSTRAINT inspections_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehiclesc(id);
-- Name: load_inspections_backup load_inspections_trip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
ALTER TABLE ONLY public.load_inspections_backup
    ADD CONSTRAINT load_inspections_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;
-- Name: trailer_inspection_backup trailer_inspection_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
ALTER TABLE ONLY public.trailer_inspection_backup
    ADD CONSTRAINT trailer_inspection_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);
-- Name: trailer_inspection_backup trailer_inspection_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
ALTER TABLE ONLY public.trailer_inspection_backup
    ADD CONSTRAINT trailer_inspection_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
-- Name: trailer_inspection_backup trailer_inspection_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
ALTER TABLE ONLY public.trailer_inspection_backup
    ADD CONSTRAINT trailer_inspection_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehiclesc(id);
    ADD CONSTRAINT trips_load_inspection_id_fkey FOREIGN KEY (load_inspection_id) REFERENCES public.load_inspections_backup(id) ON DELETE SET NULL;
-- Name: vehicle_inspections_backup vehicle_inspections_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
ALTER TABLE ONLY public.vehicle_inspections_backup
    ADD CONSTRAINT vehicle_inspections_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(id);
-- Name: vehicle_inspections_backup vehicle_inspections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
ALTER TABLE ONLY public.vehicle_inspections_backup
    ADD CONSTRAINT vehicle_inspections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
-- Name: vehicle_inspections_backup vehicle_inspections_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
ALTER TABLE ONLY public.vehicle_inspections_backup
    ADD CONSTRAINT vehicle_inspections_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehiclesc(id);
CREATE POLICY "all 1pwbdw8_0" ON storage.objects FOR SELECT USING ((bucket_id = 'load-inspections_backup'::text));
CREATE POLICY "all 1pwbdw8_1" ON storage.objects FOR INSERT WITH CHECK ((bucket_id = 'load-inspections_backup'::text));
CREATE POLICY "all 1pwbdw8_2" ON storage.objects FOR UPDATE USING ((bucket_id = 'load-inspections_backup'::text));
CREATE POLICY "all 1pwbdw8_3" ON storage.objects FOR DELETE USING ((bucket_id = 'load-inspections_backup'::text));
-- Name: supabase_realtime inspection_templates_backup; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.inspection_templates_backup;
-- Name: supabase_realtime load_inspections_backup; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.load_inspections_backup;
-- Name: supabase_realtime trailer_inspection_backup; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.trailer_inspection_backup;
-- Name: TABLE inspection_templates_backup; Type: ACL; Schema: public; Owner: postgres
GRANT ALL ON TABLE public.inspection_templates_backup TO anon;
GRANT ALL ON TABLE public.inspection_templates_backup TO authenticated;
GRANT ALL ON TABLE public.inspection_templates_backup TO service_role;
-- Name: TABLE inspections_backup; Type: ACL; Schema: public; Owner: postgres
GRANT ALL ON TABLE public.inspections_backup TO anon;
GRANT ALL ON TABLE public.inspections_backup TO authenticated;
GRANT ALL ON TABLE public.inspections_backup TO service_role;
-- Name: SEQUENCE inspections_id_seq; Type: ACL; Schema: public; Owner: postgres
GRANT ALL ON SEQUENCE public.inspections_id_seq TO anon;
GRANT ALL ON SEQUENCE public.inspections_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.inspections_id_seq TO service_role;
-- Name: TABLE load_inspections_backup; Type: ACL; Schema: public; Owner: postgres
GRANT ALL ON TABLE public.load_inspections_backup TO anon;
GRANT ALL ON TABLE public.load_inspections_backup TO authenticated;
GRANT ALL ON TABLE public.load_inspections_backup TO service_role;
-- Name: SEQUENCE load_inspections_id_seq; Type: ACL; Schema: public; Owner: postgres
GRANT ALL ON SEQUENCE public.load_inspections_id_seq TO anon;
GRANT ALL ON SEQUENCE public.load_inspections_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.load_inspections_id_seq TO service_role;
-- Name: TABLE trailer_inspection_backup; Type: ACL; Schema: public; Owner: postgres
GRANT ALL ON TABLE public.trailer_inspection_backup TO anon;
GRANT ALL ON TABLE public.trailer_inspection_backup TO authenticated;
GRANT ALL ON TABLE public.trailer_inspection_backup TO service_role;
-- Name: SEQUENCE trailer_inspection_id_seq; Type: ACL; Schema: public; Owner: postgres
GRANT ALL ON SEQUENCE public.trailer_inspection_id_seq TO anon;
GRANT ALL ON SEQUENCE public.trailer_inspection_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.trailer_inspection_id_seq TO service_role;
-- Name: TABLE vehicle_inspections_backup; Type: ACL; Schema: public; Owner: postgres
GRANT ALL ON TABLE public.vehicle_inspections_backup TO anon;
GRANT ALL ON TABLE public.vehicle_inspections_backup TO authenticated;
GRANT ALL ON TABLE public.vehicle_inspections_backup TO service_role;
-- Name: SEQUENCE vehicle_inspections_id_seq; Type: ACL; Schema: public; Owner: postgres
GRANT ALL ON SEQUENCE public.vehicle_inspections_id_seq TO anon;
GRANT ALL ON SEQUENCE public.vehicle_inspections_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.vehicle_inspections_id_seq TO service_role;
