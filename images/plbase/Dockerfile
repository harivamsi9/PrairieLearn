FROM amazonlinux:2023
ARG CACHEBUST=2025-12-15-14-17-42

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
