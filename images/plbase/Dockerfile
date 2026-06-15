FROM amazonlinux:2023
ARG CACHEBUST=2026-06-15-18-19-59

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
